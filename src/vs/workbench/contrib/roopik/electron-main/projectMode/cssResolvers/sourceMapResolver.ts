/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs/promises';
import type { CSSSourceLocation } from '../../../common/cssResolvers/types.js';

/**
 * Interface for source-map library's SourceMapConsumer
 */
interface ISourceMapConsumer {
	originalPositionFor(params: { line: number; column: number }): {
		source: string | null;
		line: number | null;
		column: number | null;
		name: string | null;
	};
	destroy(): void;
}

// Lazy-loaded source-map module
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SourceMapConsumerClass: any = null;

/**
 * Dynamically load the source-map module
 * Returns the SourceMapConsumer class or null if not available
 */
async function loadSourceMapModule(): Promise<any> {
	if (!SourceMapConsumerClass) {
		try {
			const sourceMapModule = await import('source-map');
			SourceMapConsumerClass = sourceMapModule.SourceMapConsumer;
		} catch (error) {
			console.warn('[SourceMapResolver] source-map module not available:', error);
			return null;
		}
	}
	return SourceMapConsumerClass;
}

/**
 * Parsed source map data
 */
interface SourceMapData {
	version: number;
	sources: string[];
	sourcesContent?: (string | null)[];
	mappings: string;
	names?: string[];
	file?: string;
	sourceRoot?: string;
}

/**
 * Source Map Resolver
 *
 * Resolves compiled CSS locations (from SCSS, LESS, PostCSS) back to
 * original source files using CSS source maps.
 *
 * Source maps are automatically generated when:
 * - Vite's css.devSourcemap is enabled (we enable this in our plugin)
 * - SASS/LESS compilers generate source maps
 * - PostCSS plugins generate source maps
 *
 * Source map format (ECMA-426):
 * {
 *   "version": 3,
 *   "sources": ["../src/button.scss"],
 *   "mappings": "AAAA,OACE...",
 *   "sourcesContent": ["...original scss..."]
 * }
 *
 * Important notes:
 * - Source maps use 1-indexed lines, 0-indexed columns
 * - sourceMappingURL can be inline (base64 data URL) or external (.map file)
 * - We cache parsed consumers to avoid repeated parsing
 */
export class SourceMapResolver {

	// Cache parsed source maps: cssFilePath → SourceMapConsumer
	private sourceMapCache = new Map<string, ISourceMapConsumer>();

	// Cache for failed lookups to avoid repeated fs operations
	private failedLookups = new Set<string>();

	/**
	 * Check if a source map exists for a CSS file
	 *
	 * Checks for:
	 * - External source map (.css.map file)
	 * - Inline source map (data: URL in CSS)
	 * - sourceMappingURL comment in CSS
	 */
	async hasSourceMap(cssFilePath: string): Promise<boolean> {
		// Check failed lookup cache first
		if (this.failedLookups.has(cssFilePath)) {
			return false;
		}

		// Check cached consumers
		if (this.sourceMapCache.has(cssFilePath)) {
			return true;
		}

		// Check for .map file
		const mapPath = this.getMapFilePath(cssFilePath);
		try {
			await fs.access(mapPath);
			return true;
		} catch {
			// Check for inline source map in CSS content
			try {
				const cssContent = await fs.readFile(cssFilePath, 'utf-8');
				return this.hasInlineSourceMap(cssContent);
			} catch {
				this.failedLookups.add(cssFilePath);
				return false;
			}
		}
	}

	/**
	 * Resolve a compiled CSS location to original source
	 *
	 * @param cssFilePath - Path to compiled CSS file
	 * @param line - Line in compiled CSS (1-indexed)
	 * @param column - Column in compiled CSS (0-indexed)
	 * @returns Original source location or null if not mappable
	 */
	async resolveToOriginal(
		cssFilePath: string,
		line: number,
		column: number
	): Promise<CSSSourceLocation | null> {
		try {
			const consumer = await this.getSourceMapConsumer(cssFilePath);
			if (!consumer) {
				return null;
			}

			// source-map library uses 1-indexed lines, 0-indexed columns
			const original = consumer.originalPositionFor({
				line,
				column
			});

			if (!original.source) {
				return null;
			}

			// Resolve relative source path
			const sourceFile = this.resolveSourcePath(cssFilePath, original.source);

			return {
				file: sourceFile,
				line: original.line || 1,
				column: original.column || 0
			};
		} catch (error) {
			console.error('[SourceMapResolver] Failed to resolve:', cssFilePath, error);
			return null;
		}
	}

	/**
	 * Resolve a compiled CSS location with end position
	 *
	 * @param cssFilePath - Path to compiled CSS file
	 * @param startLine - Start line in compiled CSS (1-indexed)
	 * @param startColumn - Start column (0-indexed)
	 * @param endLine - End line in compiled CSS (1-indexed)
	 * @param endColumn - End column (0-indexed)
	 * @returns Original source location with range or null
	 */
	async resolveRangeToOriginal(
		cssFilePath: string,
		startLine: number,
		startColumn: number,
		endLine: number,
		endColumn: number
	): Promise<CSSSourceLocation | null> {
		try {
			const consumer = await this.getSourceMapConsumer(cssFilePath);
			if (!consumer) {
				return null;
			}

			// Resolve start position
			const originalStart = consumer.originalPositionFor({
				line: startLine,
				column: startColumn
			});

			if (!originalStart.source) {
				return null;
			}

			// Resolve end position
			const originalEnd = consumer.originalPositionFor({
				line: endLine,
				column: endColumn
			});

			const sourceFile = this.resolveSourcePath(cssFilePath, originalStart.source);

			return {
				file: sourceFile,
				line: originalStart.line || 1,
				column: originalStart.column || 0,
				endLine: originalEnd.line || originalStart.line || 1,
				endColumn: originalEnd.column || originalStart.column || 0
			};
		} catch (error) {
			console.error('[SourceMapResolver] Failed to resolve range:', cssFilePath, error);
			return null;
		}
	}

	/**
	 * Get the original file extension (to detect SCSS, LESS, etc.)
	 */
	async getOriginalExtension(cssFilePath: string): Promise<string | null> {
		try {
			const consumer = await this.getSourceMapConsumer(cssFilePath);
			if (!consumer) {
				return null;
			}

			// Try to resolve any position to get source file
			const original = consumer.originalPositionFor({ line: 1, column: 0 });
			if (!original.source) {
				return null;
			}

			return path.extname(original.source).toLowerCase();
		} catch {
			return null;
		}
	}

	/**
	 * Clear cache (call when files change)
	 */
	clearCache(): void {
		for (const consumer of this.sourceMapCache.values()) {
			try {
				consumer.destroy();
			} catch {
				// Ignore destroy errors
			}
		}
		this.sourceMapCache.clear();
		this.failedLookups.clear();
	}

	/**
	 * Clear cache for a specific file
	 */
	clearFileCache(cssFilePath: string): void {
		const consumer = this.sourceMapCache.get(cssFilePath);
		if (consumer) {
			try {
				consumer.destroy();
			} catch {
				// Ignore destroy errors
			}
			this.sourceMapCache.delete(cssFilePath);
		}
		this.failedLookups.delete(cssFilePath);
	}

	// ============================================
	// Private Methods
	// ============================================

	/**
	 * Get or create SourceMapConsumer for a CSS file
	 */
	private async getSourceMapConsumer(cssFilePath: string): Promise<ISourceMapConsumer | null> {
		// Check failed lookup cache first
		if (this.failedLookups.has(cssFilePath)) {
			return null;
		}

		// Check cache
		if (this.sourceMapCache.has(cssFilePath)) {
			return this.sourceMapCache.get(cssFilePath)!;
		}

		try {
			// Dynamically load source-map module
			const SourceMapConsumer = await loadSourceMapModule();
			if (!SourceMapConsumer) {
				this.failedLookups.add(cssFilePath);
				return null;
			}

			const sourceMapData = await this.loadSourceMap(cssFilePath);
			if (!sourceMapData) {
				this.failedLookups.add(cssFilePath);
				return null;
			}

			const consumer = await new SourceMapConsumer(sourceMapData) as ISourceMapConsumer;

			this.sourceMapCache.set(cssFilePath, consumer);
			return consumer;
		} catch (error) {
			console.error('[SourceMapResolver] Failed to load source map:', cssFilePath, error);
			this.failedLookups.add(cssFilePath);
			return null;
		}
	}

	/**
	 * Load source map data from file or inline
	 */
	private async loadSourceMap(cssFilePath: string): Promise<SourceMapData | null> {
		// Try external .map file first
		const mapPath = this.getMapFilePath(cssFilePath);
		try {
			const mapContent = await fs.readFile(mapPath, 'utf-8');
			return JSON.parse(mapContent) as SourceMapData;
		} catch {
			// Try inline source map
			return this.extractInlineSourceMap(cssFilePath);
		}
	}

	/**
	 * Extract inline source map from CSS content
	 */
	private async extractInlineSourceMap(cssFilePath: string): Promise<SourceMapData | null> {
		try {
			const cssContent = await fs.readFile(cssFilePath, 'utf-8');

			// Look for inline source map (base64 encoded)
			const inlineMatch = cssContent.match(/\/\*#\s*sourceMappingURL=data:application\/json;(?:charset=[^;]+;)?base64,([A-Za-z0-9+/=]+)\s*\*\//);
			if (inlineMatch) {
				const base64Data = inlineMatch[1];
				const jsonString = Buffer.from(base64Data, 'base64').toString('utf-8');
				return JSON.parse(jsonString) as SourceMapData;
			}

			// Look for external source map URL
			const urlMatch = cssContent.match(/\/\*#\s*sourceMappingURL=([^\s*]+)\s*\*\//);
			if (urlMatch) {
				const mapUrl = urlMatch[1];
				const resolvedMapPath = path.resolve(path.dirname(cssFilePath), mapUrl);
				const mapContent = await fs.readFile(resolvedMapPath, 'utf-8');
				return JSON.parse(mapContent) as SourceMapData;
			}

			return null;
		} catch (error) {
			console.error('[SourceMapResolver] Failed to extract inline source map:', cssFilePath, error);
			return null;
		}
	}

	/**
	 * Check if CSS content has inline source map
	 */
	private hasInlineSourceMap(cssContent: string): boolean {
		return cssContent.includes('sourceMappingURL=');
	}

	/**
	 * Get the .map file path for a CSS file
	 */
	private getMapFilePath(cssFilePath: string): string {
		return cssFilePath + '.map';
	}

	/**
	 * Resolve a relative source path to absolute
	 */
	private resolveSourcePath(cssFilePath: string, sourcePath: string): string {
		// If already absolute, return as-is
		if (path.isAbsolute(sourcePath)) {
			return this.normalizePath(sourcePath);
		}

		// Resolve relative to the CSS file's directory
		const cssDir = path.dirname(cssFilePath);
		const resolved = path.resolve(cssDir, sourcePath);
		return this.normalizePath(resolved);
	}

	/**
	 * Normalize path to forward slashes
	 */
	private normalizePath(filePath: string): string {
		return filePath.replace(/\\/g, '/');
	}
}
