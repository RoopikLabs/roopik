import * as vscode from "vscode";
import { QDRANT_CODE_BLOCK_NAMESPACE, MAX_FILE_SIZE_BYTES, BATCH_SEGMENT_THRESHOLD, MAX_BATCH_RETRIES, INITIAL_RETRY_DELAY_MS, } from "../constants";
import { createHash } from "crypto";
import { RooIgnoreController } from "../../../core/ignore/RooIgnoreController";
import { v5 as uuidv5 } from "uuid";
import { scannerExtensions } from "../shared/supported-extensions";
import { codeParser } from "./parser";
import { generateNormalizedAbsolutePath, generateRelativeFilePath } from "../shared/get-relative-path";
import { isPathInIgnoredDirectory } from "../../glob/ignore-utils";
import { TelemetryService } from "@roo-code/telemetry";
import { TelemetryEventName } from "@roo-code/types";
import { sanitizeErrorMessage } from "../shared/validation-helpers";
import { Package } from "../../../shared/package";
/**
 * Implementation of the file watcher interface
 */
export class FileWatcher {
    workspacePath;
    context;
    cacheManager;
    embedder;
    vectorStore;
    ignoreInstance;
    fileWatcher;
    ignoreController;
    accumulatedEvents = new Map();
    batchProcessDebounceTimer;
    BATCH_DEBOUNCE_DELAY_MS = 500;
    FILE_PROCESSING_CONCURRENCY_LIMIT = 10;
    batchSegmentThreshold;
    _onDidStartBatchProcessing = new vscode.EventEmitter();
    _onBatchProgressUpdate = new vscode.EventEmitter();
    _onDidFinishBatchProcessing = new vscode.EventEmitter();
    /**
     * Event emitted when a batch of files begins processing
     */
    onDidStartBatchProcessing = this._onDidStartBatchProcessing.event;
    /**
     * Event emitted to report progress during batch processing
     */
    onBatchProgressUpdate = this._onBatchProgressUpdate.event;
    /**
     * Event emitted when a batch of files has finished processing
     */
    onDidFinishBatchProcessing = this._onDidFinishBatchProcessing.event;
    /**
     * Creates a new file watcher
     * @param workspacePath Path to the workspace
     * @param context VS Code extension context
     * @param embedder Optional embedder
     * @param vectorStore Optional vector store
     * @param cacheManager Cache manager
     */
    constructor(workspacePath, context, cacheManager, embedder, vectorStore, ignoreInstance, ignoreController, batchSegmentThreshold) {
        this.workspacePath = workspacePath;
        this.context = context;
        this.cacheManager = cacheManager;
        this.embedder = embedder;
        this.vectorStore = vectorStore;
        this.ignoreController = ignoreController || new RooIgnoreController(workspacePath);
        if (ignoreInstance) {
            this.ignoreInstance = ignoreInstance;
        }
        // Get the configurable batch size from VSCode settings, fallback to default
        // If not provided in constructor, try to get from VSCode settings
        if (batchSegmentThreshold !== undefined) {
            this.batchSegmentThreshold = batchSegmentThreshold;
        }
        else {
            try {
                this.batchSegmentThreshold = vscode.workspace
                    .getConfiguration(Package.name)
                    .get("codeIndex.embeddingBatchSize", BATCH_SEGMENT_THRESHOLD);
            }
            catch {
                // In test environment, vscode.workspace might not be available
                this.batchSegmentThreshold = BATCH_SEGMENT_THRESHOLD;
            }
        }
    }
    /**
     * Initializes the file watcher
     */
    async initialize() {
        // Create file watcher
        const filePattern = new vscode.RelativePattern(this.workspacePath, `**/*{${scannerExtensions.map((e) => e.substring(1)).join(",")}}`);
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(filePattern);
        // Register event handlers
        this.fileWatcher.onDidCreate(this.handleFileCreated.bind(this));
        this.fileWatcher.onDidChange(this.handleFileChanged.bind(this));
        this.fileWatcher.onDidDelete(this.handleFileDeleted.bind(this));
    }
    /**
     * Disposes the file watcher
     */
    dispose() {
        this.fileWatcher?.dispose();
        if (this.batchProcessDebounceTimer) {
            clearTimeout(this.batchProcessDebounceTimer);
        }
        this._onDidStartBatchProcessing.dispose();
        this._onBatchProgressUpdate.dispose();
        this._onDidFinishBatchProcessing.dispose();
        this.accumulatedEvents.clear();
    }
    /**
     * Handles file creation events
     * @param uri URI of the created file
     */
    async handleFileCreated(uri) {
        this.accumulatedEvents.set(uri.fsPath, { uri, type: "create" });
        this.scheduleBatchProcessing();
    }
    /**
     * Handles file change events
     * @param uri URI of the changed file
     */
    async handleFileChanged(uri) {
        this.accumulatedEvents.set(uri.fsPath, { uri, type: "change" });
        this.scheduleBatchProcessing();
    }
    /**
     * Handles file deletion events
     * @param uri URI of the deleted file
     */
    async handleFileDeleted(uri) {
        this.accumulatedEvents.set(uri.fsPath, { uri, type: "delete" });
        this.scheduleBatchProcessing();
    }
    /**
     * Schedules batch processing with debounce
     */
    scheduleBatchProcessing() {
        if (this.batchProcessDebounceTimer) {
            clearTimeout(this.batchProcessDebounceTimer);
        }
        this.batchProcessDebounceTimer = setTimeout(() => this.triggerBatchProcessing(), this.BATCH_DEBOUNCE_DELAY_MS);
    }
    /**
     * Triggers processing of accumulated events
     */
    async triggerBatchProcessing() {
        if (this.accumulatedEvents.size === 0) {
            return;
        }
        const eventsToProcess = new Map(this.accumulatedEvents);
        this.accumulatedEvents.clear();
        const filePathsInBatch = Array.from(eventsToProcess.keys());
        this._onDidStartBatchProcessing.fire(filePathsInBatch);
        await this.processBatch(eventsToProcess);
    }
    /**
     * Processes a batch of accumulated events
     * @param eventsToProcess Map of events to process
     */
    async _handleBatchDeletions(batchResults, processedCountInBatch, totalFilesInBatch, pathsToExplicitlyDelete, filesToUpsertDetails) {
        let overallBatchError;
        const allPathsToClearFromDB = new Set(pathsToExplicitlyDelete);
        for (const fileDetail of filesToUpsertDetails) {
            if (fileDetail.originalType === "change") {
                allPathsToClearFromDB.add(fileDetail.path);
            }
        }
        if (allPathsToClearFromDB.size > 0 && this.vectorStore) {
            try {
                await this.vectorStore.deletePointsByMultipleFilePaths(Array.from(allPathsToClearFromDB));
                for (const path of pathsToExplicitlyDelete) {
                    this.cacheManager.deleteHash(path);
                    batchResults.push({ path, status: "success" });
                    processedCountInBatch++;
                    this._onBatchProgressUpdate.fire({
                        processedInBatch: processedCountInBatch,
                        totalInBatch: totalFilesInBatch,
                        currentFile: path,
                    });
                }
            }
            catch (error) {
                const errorStatus = error?.status || error?.response?.status || error?.statusCode;
                const errorMessage = error instanceof Error ? error.message : String(error);
                // Log telemetry for deletion error
                TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
                    error: sanitizeErrorMessage(errorMessage),
                    location: "deletePointsByMultipleFilePaths",
                    errorType: "deletion_error",
                    errorStatus: errorStatus,
                });
                // Mark all paths as error
                overallBatchError = error;
                for (const path of pathsToExplicitlyDelete) {
                    batchResults.push({ path, status: "error", error: error });
                    processedCountInBatch++;
                    this._onBatchProgressUpdate.fire({
                        processedInBatch: processedCountInBatch,
                        totalInBatch: totalFilesInBatch,
                        currentFile: path,
                    });
                }
            }
        }
        return { overallBatchError, clearedPaths: allPathsToClearFromDB, processedCount: processedCountInBatch };
    }
    async _processFilesAndPrepareUpserts(filesToUpsertDetails, batchResults, processedCountInBatch, totalFilesInBatch, pathsToExplicitlyDelete) {
        const pointsForBatchUpsert = [];
        const successfullyProcessedForUpsert = [];
        const filesToProcessConcurrently = [...filesToUpsertDetails];
        for (let i = 0; i < filesToProcessConcurrently.length; i += this.FILE_PROCESSING_CONCURRENCY_LIMIT) {
            const chunkToProcess = filesToProcessConcurrently.slice(i, i + this.FILE_PROCESSING_CONCURRENCY_LIMIT);
            const chunkProcessingPromises = chunkToProcess.map(async (fileDetail) => {
                this._onBatchProgressUpdate.fire({
                    processedInBatch: processedCountInBatch,
                    totalInBatch: totalFilesInBatch,
                    currentFile: fileDetail.path,
                });
                try {
                    const result = await this.processFile(fileDetail.path);
                    return { path: fileDetail.path, result: result, error: undefined };
                }
                catch (e) {
                    const error = e;
                    console.error(`[FileWatcher] Unhandled exception processing file ${fileDetail.path}:`, e);
                    return { path: fileDetail.path, result: undefined, error: error };
                }
            });
            const settledChunkResults = await Promise.allSettled(chunkProcessingPromises);
            for (const settledResult of settledChunkResults) {
                let resultPath;
                if (settledResult.status === "fulfilled") {
                    const { path, result, error: directError } = settledResult.value;
                    resultPath = path;
                    if (directError) {
                        batchResults.push({ path, status: "error", error: directError });
                    }
                    else if (result) {
                        if (result.status === "skipped" || result.status === "local_error") {
                            batchResults.push(result);
                        }
                        else if (result.status === "processed_for_batching" && result.pointsToUpsert) {
                            pointsForBatchUpsert.push(...result.pointsToUpsert);
                            if (result.path && result.newHash) {
                                successfullyProcessedForUpsert.push({ path: result.path, newHash: result.newHash });
                            }
                            else if (result.path && !result.newHash) {
                                successfullyProcessedForUpsert.push({ path: result.path });
                            }
                        }
                        else {
                            batchResults.push({
                                path,
                                status: "error",
                                error: new Error(`Unexpected result status from processFile: ${result.status} for file ${path}`),
                            });
                        }
                    }
                    else {
                        batchResults.push({
                            path,
                            status: "error",
                            error: new Error(`Fulfilled promise with no result or error for file ${path}`),
                        });
                    }
                }
                else {
                    const error = settledResult.reason;
                    const rejectedPath = settledResult.reason?.path || "unknown";
                    console.error("[FileWatcher] A file processing promise was rejected:", settledResult.reason);
                    batchResults.push({
                        path: rejectedPath,
                        status: "error",
                        error: error,
                    });
                }
                if (!pathsToExplicitlyDelete.includes(resultPath || "")) {
                    processedCountInBatch++;
                }
                this._onBatchProgressUpdate.fire({
                    processedInBatch: processedCountInBatch,
                    totalInBatch: totalFilesInBatch,
                    currentFile: resultPath,
                });
            }
        }
        return {
            pointsForBatchUpsert,
            successfullyProcessedForUpsert,
            processedCount: processedCountInBatch,
        };
    }
    async _executeBatchUpsertOperations(pointsForBatchUpsert, successfullyProcessedForUpsert, batchResults, overallBatchError) {
        if (pointsForBatchUpsert.length > 0 && this.vectorStore && !overallBatchError) {
            try {
                for (let i = 0; i < pointsForBatchUpsert.length; i += this.batchSegmentThreshold) {
                    const batch = pointsForBatchUpsert.slice(i, i + this.batchSegmentThreshold);
                    let retryCount = 0;
                    let upsertError;
                    while (retryCount < MAX_BATCH_RETRIES) {
                        try {
                            await this.vectorStore.upsertPoints(batch);
                            break;
                        }
                        catch (error) {
                            upsertError = error;
                            retryCount++;
                            if (retryCount === MAX_BATCH_RETRIES) {
                                // Log telemetry for upsert failure
                                TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
                                    error: sanitizeErrorMessage(upsertError.message),
                                    location: "upsertPoints",
                                    errorType: "upsert_retry_exhausted",
                                    retryCount: MAX_BATCH_RETRIES,
                                });
                                throw new Error(`Failed to upsert batch after ${MAX_BATCH_RETRIES} retries: ${upsertError.message}`);
                            }
                            await new Promise((resolve) => setTimeout(resolve, INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount - 1)));
                        }
                    }
                }
                for (const { path, newHash } of successfullyProcessedForUpsert) {
                    if (newHash) {
                        this.cacheManager.updateHash(path, newHash);
                    }
                    batchResults.push({ path, status: "success" });
                }
            }
            catch (error) {
                const err = error;
                overallBatchError = overallBatchError || err;
                // Log telemetry for batch upsert error
                TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
                    error: sanitizeErrorMessage(err.message),
                    location: "executeBatchUpsertOperations",
                    errorType: "batch_upsert_error",
                    affectedFiles: successfullyProcessedForUpsert.length,
                });
                for (const { path } of successfullyProcessedForUpsert) {
                    batchResults.push({ path, status: "error", error: err });
                }
            }
        }
        else if (overallBatchError && pointsForBatchUpsert.length > 0) {
            for (const { path } of successfullyProcessedForUpsert) {
                batchResults.push({ path, status: "error", error: overallBatchError });
            }
        }
        return overallBatchError;
    }
    async processBatch(eventsToProcess) {
        const batchResults = [];
        let processedCountInBatch = 0;
        const totalFilesInBatch = eventsToProcess.size;
        let overallBatchError;
        // Initial progress update
        this._onBatchProgressUpdate.fire({
            processedInBatch: 0,
            totalInBatch: totalFilesInBatch,
            currentFile: undefined,
        });
        // Categorize events
        const pathsToExplicitlyDelete = [];
        const filesToUpsertDetails = [];
        for (const event of eventsToProcess.values()) {
            if (event.type === "delete") {
                pathsToExplicitlyDelete.push(event.uri.fsPath);
            }
            else {
                filesToUpsertDetails.push({
                    path: event.uri.fsPath,
                    uri: event.uri,
                    originalType: event.type,
                });
            }
        }
        // Phase 1: Handle deletions
        const { overallBatchError: deletionError, processedCount: deletionCount } = await this._handleBatchDeletions(batchResults, processedCountInBatch, totalFilesInBatch, pathsToExplicitlyDelete, filesToUpsertDetails);
        overallBatchError = deletionError;
        processedCountInBatch = deletionCount;
        // Phase 2: Process files and prepare upserts
        const { pointsForBatchUpsert, successfullyProcessedForUpsert, processedCount: upsertCount, } = await this._processFilesAndPrepareUpserts(filesToUpsertDetails, batchResults, processedCountInBatch, totalFilesInBatch, pathsToExplicitlyDelete);
        processedCountInBatch = upsertCount;
        // Phase 3: Execute batch upsert
        overallBatchError = await this._executeBatchUpsertOperations(pointsForBatchUpsert, successfullyProcessedForUpsert, batchResults, overallBatchError);
        // Finalize
        this._onDidFinishBatchProcessing.fire({
            processedFiles: batchResults,
            batchError: overallBatchError,
        });
        this._onBatchProgressUpdate.fire({
            processedInBatch: totalFilesInBatch,
            totalInBatch: totalFilesInBatch,
        });
        if (this.accumulatedEvents.size === 0) {
            this._onBatchProgressUpdate.fire({
                processedInBatch: 0,
                totalInBatch: 0,
                currentFile: undefined,
            });
        }
    }
    /**
     * Processes a file
     * @param filePath Path to the file to process
     * @returns Promise resolving to processing result
     */
    async processFile(filePath) {
        try {
            // Get relative path for ignore checks
            const relativeFilePath = generateRelativeFilePath(filePath, this.workspacePath);
            // Check if file is in an ignored directory
            // Use relative path to avoid matching parent directories outside the workspace
            if (isPathInIgnoredDirectory(relativeFilePath)) {
                return {
                    path: filePath,
                    status: "skipped",
                    reason: "File is in an ignored directory",
                };
            }
            // Check if file should be ignored
            if (!this.ignoreController.validateAccess(filePath) ||
                (this.ignoreInstance && this.ignoreInstance.ignores(relativeFilePath))) {
                return {
                    path: filePath,
                    status: "skipped",
                    reason: "File is ignored by .rooignore or .gitignore",
                };
            }
            // Check file size
            const fileStat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
            if (fileStat.size > MAX_FILE_SIZE_BYTES) {
                return {
                    path: filePath,
                    status: "skipped",
                    reason: "File is too large",
                };
            }
            // Read file content
            const fileContent = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
            const content = fileContent.toString();
            // Calculate hash
            const newHash = createHash("sha256").update(content).digest("hex");
            // Check if file has changed
            if (this.cacheManager.getHash(filePath) === newHash) {
                return {
                    path: filePath,
                    status: "skipped",
                    reason: "File has not changed",
                };
            }
            // Parse file
            const blocks = await codeParser.parseFile(filePath, { content, fileHash: newHash });
            // Prepare points for batch processing
            let pointsToUpsert = [];
            if (this.embedder && blocks.length > 0) {
                const texts = blocks.map((block) => block.content);
                const { embeddings } = await this.embedder.createEmbeddings(texts);
                pointsToUpsert = blocks.map((block, index) => {
                    const normalizedAbsolutePath = generateNormalizedAbsolutePath(block.file_path, this.workspacePath);
                    const stableName = `${normalizedAbsolutePath}:${block.start_line}`;
                    const pointId = uuidv5(stableName, QDRANT_CODE_BLOCK_NAMESPACE);
                    return {
                        id: pointId,
                        vector: embeddings[index],
                        payload: {
                            filePath: generateRelativeFilePath(normalizedAbsolutePath, this.workspacePath),
                            codeChunk: block.content,
                            startLine: block.start_line,
                            endLine: block.end_line,
                        },
                    };
                });
            }
            return {
                path: filePath,
                status: "processed_for_batching",
                newHash,
                pointsToUpsert,
            };
        }
        catch (error) {
            return {
                path: filePath,
                status: "local_error",
                error: error,
            };
        }
    }
}
//# sourceMappingURL=file-watcher.js.map