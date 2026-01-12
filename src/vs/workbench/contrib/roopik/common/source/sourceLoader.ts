/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Result from loading source files
 */
export interface SourceLoadResult {
	/** Map of filename → content (relative paths as keys) */
	files: Record<string, string>;

	/** Files that were successfully loaded */
	filesLoaded: number;

	/** Files that were skipped (unreadable, binary, etc.) */
	filesSkipped: number;

	/** Total bytes loaded */
	bytesLoaded: number;

	/** Warnings during loading (non-fatal) */
	warnings: string[];
}

/**
 * Options for loading source files
 */
export interface SourceLoadOptions {
	/**
	 * File extensions to include (defaults to common source extensions)
	 * Example: ['.ts', '.tsx', '.js', '.jsx', '.css', '.html']
	 */
	extensions?: string[];

	/**
	 * Maximum file size in bytes (default: 5MB)
	 * Files larger than this are skipped with warning
	 */
	maxFileSize?: number;
}

/**
 * Default source file extensions
 */
const DEFAULT_EXTENSIONS = [
	// JavaScript/TypeScript
	'.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
	// Styles
	'.css', '.scss', '.sass', '.less',
	// Templates
	'.html', '.htm', '.vue', '.svelte',
	// Data
	'.json', '.json5',
	// Config
	'.env'
];

/**
 * Load all source files from a component folder
 *
 * Strategy:
 * - Recursively scan folder
 * - Filter by extension (only load source files)
 * - Skip: node_modules/, dist/, build/, out/, .git/, hidden files
 * - Defensive: skip unreadable/binary files with warning
 * - Return files as Record<relativePath, content>
 *
 * This is used by buildService to get source files for bundling.
 *
 * @param folderPath Absolute path to component folder
 * @param options Optional configuration
 * @returns SourceLoadResult with files map + metadata (never throws)
 */
export async function loadSourceFiles(folderPath: string, options?: SourceLoadOptions): Promise<SourceLoadResult> {
	const extensions = options?.extensions ?? DEFAULT_EXTENSIONS;
	const maxFileSize = options?.maxFileSize ?? 5 * 1024 * 1024; // 5MB default

	const warnings: string[] = [];
	const files: Record<string, string> = {};
	const filePaths: string[] = [];

	// ========================================================================
	// Step 1: Recursively collect all source file paths
	// ========================================================================

	async function collectFiles(dir: string): Promise<void> {
		try {
			const entries = await fs.readdir(dir, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name);

				// Skip excluded directories and hidden files
				if (entry.name.startsWith('.') ||
					entry.name === 'node_modules' ||
					entry.name === 'dist' ||
					entry.name === 'build' ||
					entry.name === 'out') {
					continue;
				}

				if (entry.isDirectory()) {
					await collectFiles(fullPath);
				} else {
					// Only include files with matching extensions
					const ext = path.extname(entry.name).toLowerCase();
					if (extensions.includes(ext)) {
						filePaths.push(fullPath);
					}
				}
			}
		} catch (error) {
			const msg = `Failed to read directory: ${dir} - ${error instanceof Error ? error.message : String(error)}`;
			warnings.push(msg);
		}
	}

	await collectFiles(folderPath);

	// ========================================================================
	// Step 2: Load file contents (defensive)
	// ========================================================================

	let filesLoaded = 0;
	let filesSkipped = 0;
	let bytesLoaded = 0;

	for (const fullPath of filePaths) {
		const relativePath = path.relative(folderPath, fullPath);

		try {
			// Check file size before reading
			const stats = await fs.stat(fullPath);
			if (stats.size > maxFileSize) {
				const msg = `Skipping large file: ${relativePath} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`;
				warnings.push(msg);
				filesSkipped++;
				continue;
			}

			// Read file content
			const content = await fs.readFile(fullPath, 'utf-8');

			// Store with normalized path (use forward slashes for consistency)
			const normalizedPath = relativePath.replace(/\\/g, '/');
			files[normalizedPath] = content;

			filesLoaded++;
			bytesLoaded += content.length;

		} catch (error) {
			// Log warning but continue with next file
			const msg = `Failed to read file: ${relativePath} - ${error instanceof Error ? error.message : String(error)}`;
			warnings.push(msg);
			filesSkipped++;
		}
	}

	// ========================================================================
	// Step 3: Return result
	// ========================================================================

	return {
		files,
		filesLoaded,
		filesSkipped,
		bytesLoaded,
		warnings
	};
}

/**
 * Convenience function: load files, return just the files map
 * (For cases where you only need the files, not metadata)
 */
export async function getSourceFiles(folderPath: string, options?: SourceLoadOptions): Promise<Record<string, string>> {
	const result = await loadSourceFiles(folderPath, options);
	return result.files;
}
