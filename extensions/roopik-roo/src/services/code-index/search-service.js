import * as path from "path";
import { TelemetryService } from "@roo-code/telemetry";
import { TelemetryEventName } from "@roo-code/types";
/**
 * Service responsible for searching the code index.
 */
export class CodeIndexSearchService {
    configManager;
    stateManager;
    embedder;
    vectorStore;
    constructor(configManager, stateManager, embedder, vectorStore) {
        this.configManager = configManager;
        this.stateManager = stateManager;
        this.embedder = embedder;
        this.vectorStore = vectorStore;
    }
    /**
     * Searches the code index for relevant content.
     * @param query The search query
     * @param limit Maximum number of results to return
     * @param directoryPrefix Optional directory path to filter results by
     * @returns Array of search results
     * @throws Error if the service is not properly configured or ready
     */
    async searchIndex(query, directoryPrefix) {
        if (!this.configManager.isFeatureEnabled || !this.configManager.isFeatureConfigured) {
            throw new Error("Code index feature is disabled or not configured.");
        }
        const minScore = this.configManager.currentSearchMinScore;
        const maxResults = this.configManager.currentSearchMaxResults;
        const currentState = this.stateManager.getCurrentStatus().systemStatus;
        if (currentState !== "Indexed" && currentState !== "Indexing") {
            // Allow search during Indexing too
            throw new Error(`Code index is not ready for search. Current state: ${currentState}`);
        }
        try {
            // Generate embedding for query
            const embeddingResponse = await this.embedder.createEmbeddings([query]);
            const vector = embeddingResponse?.embeddings[0];
            if (!vector) {
                throw new Error("Failed to generate embedding for query.");
            }
            // Handle directory prefix
            let normalizedPrefix = undefined;
            if (directoryPrefix) {
                normalizedPrefix = path.normalize(directoryPrefix);
            }
            // Perform search
            const results = await this.vectorStore.search(vector, normalizedPrefix, minScore, maxResults);
            return results;
        }
        catch (error) {
            console.error("[CodeIndexSearchService] Error during search:", error);
            this.stateManager.setSystemState("Error", `Search failed: ${error.message}`);
            // Capture telemetry for the error
            TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
                error: error.message,
                stack: error.stack,
                location: "searchIndex",
            });
            throw error; // Re-throw the error after setting state
        }
    }
}
//# sourceMappingURL=search-service.js.map