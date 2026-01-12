/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import type {
	IPendingChangesConfig,
	IPendingChangesService,
	IPendingFile,
	IPendingFileMetadata,
	IApplyResult,
	PendingChangeSource,
	OnPendingFilesChangedCallback
} from '../../common/pendingChanges/types.js';
import { DEFAULT_PENDING_CONFIG } from '../../common/pendingChanges/types.js';

/**
 * Pending Changes Service - Main Process Implementation
 *
 * Manages pending file changes using the "dirty buffer" pattern:
 * - Original files on disk remain untouched
 * - Changes are written to a pending folder
 * - User can review, edit, apply, or discard
 *
 * This service runs in the main process (Node.js) for file system access.
 * Browser process communicates via IPC channel.
 */
export class PendingChangesService implements IPendingChangesService {
	private config: IPendingChangesConfig;
	private workspaceRoot: string = '';
	private pendingFiles: Map<string, IPendingFile> = new Map();
	private callbacks: OnPendingFilesChangedCallback[] = [];
	private initialized: boolean = false;

	constructor(config?: Partial<IPendingChangesConfig>) {
		this.config = { ...DEFAULT_PENDING_CONFIG, ...config };
	}

	// ============================================
	// Configuration
	// ============================================

	getConfig(): IPendingChangesConfig {
		return { ...this.config };
	}

	setConfig(config: Partial<IPendingChangesConfig>): void {
		this.config = { ...this.config, ...config };
	}

	// ============================================
	// Initialization
	// ============================================

	async initialize(workspaceRoot: string): Promise<void> {
		this.workspaceRoot = workspaceRoot;

		// Ensure pending folder exists
		const pendingFolder = this.getPendingFolderPath();
		await this.ensureDirectory(pendingFolder);

		// Load existing pending files (if any from previous session)
		await this.loadExistingPendingFiles();

		this.initialized = true;
	}

	private getPendingFolderPath(): string {
		return path.join(this.workspaceRoot, this.config.pendingFolder);
	}

	private async ensureDirectory(dirPath: string): Promise<void> {
		try {
			await fs.promises.mkdir(dirPath, { recursive: true });
		} catch (error) {
			// Directory may already exist
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
				throw error;
			}
		}
	}

	/**
	 * Load existing pending files from disk (session recovery)
	 */
	private async loadExistingPendingFiles(): Promise<void> {
		const pendingFolder = this.getPendingFolderPath();

		try {
			const exists = fs.existsSync(pendingFolder);
			if (!exists) {
				return;
			}

			// For now, we start fresh each session
			// TODO: Implement session recovery with metadata file
			// This would require storing originalContent snapshots
		} catch {
			// Ignore errors during load
		}
	}

	// ============================================
	// Query Methods
	// ============================================

	getPendingFiles(): IPendingFile[] {
		return Array.from(this.pendingFiles.values());
	}

	getPendingFile(originalPath: string): IPendingFile | undefined {
		const normalizedPath = this.normalizePath(originalPath);
		return this.pendingFiles.get(normalizedPath);
	}

	hasPendingChanges(originalPath: string): boolean {
		const normalizedPath = this.normalizePath(originalPath);
		return this.pendingFiles.has(normalizedPath);
	}

	hasAnyPendingChanges(): boolean {
		return this.pendingFiles.size > 0;
	}

	getPendingCount(): number {
		return this.pendingFiles.size;
	}

	// ============================================
	// Core Operations
	// ============================================

	async updateFile(
		originalPath: string,
		newContent: string,
		source: PendingChangeSource,
		metadata?: IPendingFileMetadata
	): Promise<IPendingFile | undefined> {
		if (!this.initialized) {
			throw new Error('PendingChangesService not initialized. Call initialize() first.');
		}

		const normalizedPath = this.normalizePath(originalPath);

		// Read original content
		let originalContent: string;
		try {
			originalContent = await fs.promises.readFile(originalPath, 'utf-8');
		} catch (error) {
			throw new Error(`Cannot read original file: ${originalPath}`);
		}

		// If new content matches original, remove pending file (no-op)
		if (newContent === originalContent) {
			if (this.pendingFiles.has(normalizedPath)) {
				await this.discardFile(originalPath);
			}
			return undefined;
		}

		// Generate pending file path
		const pendingPath = this.generatePendingPath(originalPath);

		// Ensure parent directory exists
		await this.ensureDirectory(path.dirname(pendingPath));

		// Write pending file
		await fs.promises.writeFile(pendingPath, newContent, 'utf-8');

		// Get or create pending file entry
		const existing = this.pendingFiles.get(normalizedPath);
		const now = Date.now();

		const pendingFile: IPendingFile = {
			id: existing?.id || this.generateId(),
			originalPath: normalizedPath,
			pendingPath,
			relativePath: this.getRelativePath(originalPath),
			originalContent: existing?.originalContent || originalContent,
			createdAt: existing?.createdAt || now,
			updatedAt: now,
			source,
			metadata: {
				...existing?.metadata,
				...metadata,
				editCount: (existing?.metadata?.editCount || 0) + 1
			}
		};

		this.pendingFiles.set(normalizedPath, pendingFile);
		this.notifyChanged();

		return pendingFile;
	}

	async discardFile(originalPath: string): Promise<void> {
		const normalizedPath = this.normalizePath(originalPath);
		const pendingFile = this.pendingFiles.get(normalizedPath);

		if (!pendingFile) {
			return;
		}

		// Delete pending file from disk
		try {
			await fs.promises.unlink(pendingFile.pendingPath);
		} catch {
			// File may not exist
		}

		// Remove from tracking
		this.pendingFiles.delete(normalizedPath);
		this.notifyChanged();
	}

	async discardAll(): Promise<void> {
		const files = Array.from(this.pendingFiles.values());

		for (const file of files) {
			try {
				await fs.promises.unlink(file.pendingPath);
			} catch {
				// Ignore individual file errors
			}
		}

		this.pendingFiles.clear();
		this.notifyChanged();
	}

	async applyFile(originalPath: string): Promise<IApplyResult> {
		const normalizedPath = this.normalizePath(originalPath);
		const pendingFile = this.pendingFiles.get(normalizedPath);

		if (!pendingFile) {
			return {
				success: false,
				originalPath: normalizedPath,
				error: 'No pending changes for this file'
			};
		}

		try {
			// Read pending content
			const pendingContent = await fs.promises.readFile(pendingFile.pendingPath, 'utf-8');

			// Write to original file
			await fs.promises.writeFile(pendingFile.originalPath, pendingContent, 'utf-8');

			// Cleanup if configured
			if (this.config.cleanupOnApply) {
				try {
					await fs.promises.unlink(pendingFile.pendingPath);
				} catch {
					// Ignore cleanup errors
				}
			}

			// Remove from tracking
			this.pendingFiles.delete(normalizedPath);
			this.notifyChanged();

			return {
				success: true,
				originalPath: normalizedPath
			};
		} catch (error) {
			return {
				success: false,
				originalPath: normalizedPath,
				error: error instanceof Error ? error.message : String(error)
			};
		}
	}

	async applyAll(): Promise<IApplyResult[]> {
		const files = Array.from(this.pendingFiles.keys());
		const results: IApplyResult[] = [];

		for (const originalPath of files) {
			const result = await this.applyFile(originalPath);
			results.push(result);
		}

		return results;
	}

	getDiffUris(originalPath: string): [string, string] | undefined {
		const normalizedPath = this.normalizePath(originalPath);
		const pendingFile = this.pendingFiles.get(normalizedPath);

		if (!pendingFile) {
			return undefined;
		}

		// Return file:// URIs for VSCode diff command
		const originalUri = `file://${pendingFile.originalPath.replace(/\\/g, '/')}`;
		const pendingUri = `file://${pendingFile.pendingPath.replace(/\\/g, '/')}`;

		return [originalUri, pendingUri];
	}

	// ============================================
	// Callbacks
	// ============================================

	onPendingFilesChanged(callback: OnPendingFilesChangedCallback): void {
		this.callbacks.push(callback);
	}

	private notifyChanged(): void {
		const files = this.getPendingFiles();
		for (const callback of this.callbacks) {
			try {
				callback(files);
			} catch {
				// Ignore callback errors
			}
		}
	}

	// ============================================
	// Helpers
	// ============================================

	private normalizePath(filePath: string): string {
		// Normalize to forward slashes and resolve to absolute
		return path.resolve(filePath).replace(/\\/g, '/');
	}

	private getRelativePath(filePath: string): string {
		const relativePath = path.relative(this.workspaceRoot, filePath);
		return relativePath.replace(/\\/g, '/');
	}

	private generatePendingPath(originalPath: string): string {
		const relativePath = this.getRelativePath(originalPath);
		const pendingFolder = this.getPendingFolderPath();

		if (this.config.folderStrategy === 'flat') {
			// Flatten: src/components/Button.tsx -> src__components__Button.tsx
			const flatName = relativePath.replace(/[/\\]/g, '__');
			return path.join(pendingFolder, flatName + this.config.pendingExtension);
		} else {
			// Mirror: src/components/Button.tsx -> .roopik/pending/src/components/Button.tsx
			return path.join(pendingFolder, relativePath + this.config.pendingExtension);
		}
	}

	private generateId(): string {
		return `pending_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}

	// ============================================
	// Cleanup
	// ============================================

	dispose(): void {
		this.pendingFiles.clear();
		this.callbacks = [];
	}
}
