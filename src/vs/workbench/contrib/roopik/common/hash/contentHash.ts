/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Content Hash Utilities
 *
 * Defensive two-level hashing approach:
 * 1. Fast check: File modification times (mtime) - instant, detects most changes
 * 2. Deep check: Content hash (SHA256) - detects actual content changes
 *
 * Never fails - always returns a hash even if some files are unreadable.
 * Logs warnings but continues hashing remaining files.
 *
 * This is extracted as a utility to keep componentService focused on orchestration,
 * allowing easy upgrades and testing of hash logic independently.
 */

import * as crypto from 'crypto';
import * as path from 'path';
import { promises as fs } from 'fs';

// ============================================================================
// File Metadata (for two-level hashing in Phase 5)
// ============================================================================

/**
 * Metadata about a file for cache validation
 * Stores both modification time and content hash
 */
export interface FileMetadata {
	/** Relative path from component folder */
	relativePath: string;

	/** File modification time (for fast check) */
	mtime: number;

	/** File size in bytes */
	size: number;
}

// ============================================================================
// Hash Result (Main Output)
// ============================================================================

/**
 * Result of content hash computation
 *
 * Contains:
 * - The actual hash (never empty, returns partial hash if some files fail)
 * - Metadata about what was hashed (for diagnostics and Phase 5 optimization)
 * - Warnings if any files couldn't be read (doesn't fail, just logs)
 */
export interface ContentHashResult {
	/** SHA256 hash (first 16 chars) - ALWAYS present, even if partial */
	hash: string;

	/** Number of files successfully hashed */
	filesHashed: number;

	/** Number of files skipped due to read errors */
	filesSkipped: number;

	/** Size of hashed content in bytes */
	bytesHashed: number;

	/** File metadata for each file (for Phase 5 fast checks) */
	fileMetadata: FileMetadata[];

	/** Warnings encountered (doesn't affect hash computation) */
	warnings: string[];
}

// ============================================================================
// Content Hash Computation (Defensive, Never Fails)
// ============================================================================

/**
 * Compute deterministic content hash of all source files in a folder
 *
 * Defensive approach:
 * - Reads all source files recursively
 * - Skips unreadable files but continues
 * - Collects warnings but never throws
 * - Returns partial hash if some files fail
 *
 * Exclusions (ignored):
 * - node_modules/
 * - dist/, build/, out/
 * - .git/ and hidden files (starting with .)
 *
 * Hash determinism:
 * 1. Collect all file paths
 * 2. Sort paths alphabetically
 * 3. Hash: path → content → path → content → ...
 * 4. Use SHA256, return first 16 chars
 *
 * This ensures same files = same hash, across different reads/machines.
 *
 * @param folderPath Absolute path to component folder
 * @returns ContentHashResult with hash + metadata (never throws)
 */
export async function computeContentHashFromFolder(folderPath: string): Promise<ContentHashResult> {
	const warnings: string[] = [];
	const filePaths: string[] = [];
	const fileMetadata: Map<string, FileMetadata> = new Map();

	// ========================================================================
	// Step 1: Recursively collect all source files
	// ========================================================================

	async function collectFiles(dir: string): Promise<void> {
		try {
			const entries = await fs.readdir(dir, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name);
				const relativePath = path.relative(folderPath, fullPath);

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
					filePaths.push(relativePath);
				}
			}
		} catch (error) {
			const msg = `Failed to read directory: ${dir} - ${error instanceof Error ? error.message : String(error)}`;
			warnings.push(msg);
		}
	}

	await collectFiles(folderPath);

	// ========================================================================
	// Step 2: Sort for deterministic hash
	// ========================================================================

	filePaths.sort();

	// ========================================================================
	// Step 3: Compute hash (defensive - skip unreadable files)
	// ========================================================================

	const hash = crypto.createHash('sha256');
	let filesHashed = 0;
	let filesSkipped = 0;
	let bytesHashed = 0;

	for (const relativePath of filePaths) {
		const fullPath = path.join(folderPath, relativePath);

		try {
			const content = await fs.readFile(fullPath, 'utf-8');
			const stats = await fs.stat(fullPath);

			// Update hash
			hash.update(relativePath);
			hash.update(content);

			// Track metadata
			fileMetadata.set(relativePath, {
				relativePath,
				mtime: stats.mtimeMs,
				size: stats.size
			});

			filesHashed++;
			bytesHashed += content.length;

		} catch (error) {
			// Log warning but continue with next file
			const msg = `Failed to read file: ${relativePath} - ${error instanceof Error ? error.message : String(error)}`;
			warnings.push(msg);
			filesSkipped++;
		}
	}

	// ========================================================================
	// Step 4: Return result (hash is always present)
	// ========================================================================

	return {
		hash: hash.digest('hex').substring(0, 16),
		filesHashed,
		filesSkipped,
		bytesHashed,
		fileMetadata: Array.from(fileMetadata.values()),
		warnings
	};
}

/**
 * Convenience function: compute hash, return just the hash string
 * (For cases where you only need the hash, not metadata)
 */
export async function getContentHash(folderPath: string): Promise<string> {
	const result = await computeContentHashFromFolder(folderPath);
	return result.hash;
}

/**
 * Compare two hashes and indicate what changed
 * (Useful for Phase 5 file watcher to decide if rebuild is needed)
 *
 * Returns:
 * - 'same': Hashes are identical
 * - 'changed': Hashes are different
 * - 'unknown': One of the hashes is empty (no baseline)
 */
export function compareHashes(oldHash: string, newHash: string): 'same' | 'changed' | 'unknown' {
	if (!oldHash || !newHash) {
		return 'unknown';
	}
	return oldHash === newHash ? 'same' : 'changed';
}
