/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';

/**
 * URL to Path Converter
 *
 * Converts browser URLs (from Vite dev server) to local file paths.
 * This is necessary because CDP returns stylesheet URLs in browser format,
 * but we need local file paths for source navigation.
 *
 * Examples:
 * - http://localhost:5173/src/button.css → C:/project/src/button.css
 * - http://localhost:5173/@fs/C:/project/node_modules/x.css → C:/project/node_modules/x.css
 * - http://localhost:5173/src/styles.scss?direct → C:/project/src/styles.scss
 *
 * Handles:
 * - Regular project files (/src/button.css)
 * - Vite @fs prefix (absolute paths)
 * - Query parameters (?direct, ?inline)
 * - Data URLs (skipped)
 * - External URLs (skipped)
 *
 * Skips:
 * - node_modules files (library code, not user-editable)
 * - External CDN files (no local source)
 * - Blob/data URLs (dynamically generated)
 */
export class URLToPathConverter {

	constructor(
		private projectRoot: string,
		private readonly devServerPort: number = 5173
	) {
		// Normalize project root to forward slashes for consistent handling
		this.projectRoot = this.normalizeSlashes(projectRoot);
	}

	/**
	 * Update project root (when project changes)
	 */
	setProjectRoot(projectRoot: string): void {
		this.projectRoot = this.normalizeSlashes(projectRoot);
	}

	/**
	 * Convert a browser URL to local file path
	 *
	 * @param url - URL from browser (e.g., http://localhost:5173/src/button.css)
	 * @returns Local file path or null if external/unmappable
	 */
	convert(url: string): string | null {
		if (!url) {
			return null;
		}

		// Skip data URLs
		if (url.startsWith('data:')) {
			return null;
		}

		// Skip blob URLs
		if (url.startsWith('blob:')) {
			return null;
		}

		try {
			const parsed = new URL(url);

			// Only handle localhost (dev server)
			if (!this.isLocalHost(parsed.hostname)) {
				return null;  // External URL, can't map
			}

			let pathname = parsed.pathname;

			// Remove query parameters (e.g., ?direct, ?inline)
			// Note: URL.pathname already excludes query, but handle edge cases
			pathname = this.removeQueryParams(pathname);

			// Handle Vite's @fs prefix (absolute file paths)
			if (pathname.startsWith('/@fs/')) {
				// Remove /@fs/ prefix, rest is absolute path
				// "/@fs/C:/project/file.css" → "C:/project/file.css"
				const absolutePath = pathname.slice(5);

				// Check if it's in node_modules (skip library code)
				if (this.isInNodeModules(absolutePath)) {
					return null;
				}

				return this.normalizeSlashes(absolutePath);
			}

			// Handle Vite's @id prefix (virtual modules)
			if (pathname.startsWith('/@id/')) {
				// Virtual modules don't have physical files
				return null;
			}

			// Handle Vite's @vite prefix (internal Vite files)
			if (pathname.startsWith('/@vite/')) {
				return null;
			}

			// Handle Vite's special prefixes
			if (pathname.startsWith('/__') || pathname.startsWith('/@')) {
				// Other internal Vite paths
				return null;
			}

			// Check if URL points to node_modules
			if (this.isInNodeModules(pathname)) {
				return null;
			}

			// Regular project file: /src/button.css → projectRoot/src/button.css
			// Remove leading slash for path.join
			if (pathname.startsWith('/')) {
				pathname = pathname.slice(1);
			}

			const localPath = path.join(this.projectRoot, pathname);
			return this.normalizeSlashes(localPath);
		} catch (error) {
			console.error('[URLToPathConverter] Failed to parse URL:', url, error);
			return null;
		}
	}

	/**
	 * Convert local file path to browser URL
	 * Useful for reverse mapping (e.g., when editing files)
	 *
	 * @param filePath - Local file path
	 * @returns Browser URL or null if not mappable
	 */
	toUrl(filePath: string): string | null {
		if (!filePath) {
			return null;
		}

		const normalizedPath = this.normalizeSlashes(filePath);

		// Check if file is within project root
		if (normalizedPath.toLowerCase().startsWith(this.projectRoot.toLowerCase())) {
			// Get relative path from project root
			const relativePath = normalizedPath.slice(this.projectRoot.length);
			const cleanPath = relativePath.startsWith('/') ? relativePath : '/' + relativePath;
			return `http://localhost:${this.devServerPort}${cleanPath}`;
		}

		// File outside project root - use @fs prefix
		return `http://localhost:${this.devServerPort}/@fs${normalizedPath}`;
	}

	/**
	 * Check if URL is from our dev server
	 */
	isLocalDevServer(url: string): boolean {
		try {
			const parsed = new URL(url);
			return (
				this.isLocalHost(parsed.hostname) &&
				(parsed.port === String(this.devServerPort) || parsed.port === '')
			);
		} catch {
			return false;
		}
	}

	/**
	 * Check if URL points to node_modules (library code)
	 */
	isNodeModules(url: string): boolean {
		return this.isInNodeModules(url);
	}

	/**
	 * Check if URL is a dynamically generated style (CSS-in-JS, etc.)
	 */
	isDynamicStyle(url: string): boolean {
		return (
			url.startsWith('data:') ||
			url.startsWith('blob:') ||
			url.includes('?inline') ||
			// Vite virtual modules for CSS-in-JS
			url.includes('/@id/') ||
			// Empty or missing URL indicates injected styles
			!url
		);
	}

	/**
	 * Get source type classification for a URL
	 */
	getSourceType(url: string): 'project' | 'node_modules' | 'external' | 'dynamic' | 'unknown' {
		if (!url) {
			return 'dynamic';
		}

		if (this.isDynamicStyle(url)) {
			return 'dynamic';
		}

		if (this.isInNodeModules(url)) {
			return 'node_modules';
		}

		if (this.isLocalDevServer(url)) {
			return 'project';
		}

		try {
			const parsed = new URL(url);
			if (!this.isLocalHost(parsed.hostname)) {
				return 'external';
			}
		} catch {
			return 'unknown';
		}

		return 'project';
	}

	// ============================================
	// Private Helpers
	// ============================================

	/**
	 * Check if hostname is localhost
	 */
	private isLocalHost(hostname: string): boolean {
		return (
			hostname === 'localhost' ||
			hostname === '127.0.0.1' ||
			hostname === '::1' ||
			hostname === '[::1]'
		);
	}

	/**
	 * Check if path contains node_modules
	 */
	private isInNodeModules(pathOrUrl: string): boolean {
		const normalized = pathOrUrl.toLowerCase();
		return (
			normalized.includes('/node_modules/') ||
			normalized.includes('\\node_modules\\')
		);
	}

	/**
	 * Remove query parameters from path
	 */
	private removeQueryParams(pathname: string): string {
		const queryIndex = pathname.indexOf('?');
		if (queryIndex !== -1) {
			return pathname.slice(0, queryIndex);
		}
		return pathname;
	}

	/**
	 * Normalize path slashes to forward slashes
	 */
	private normalizeSlashes(filePath: string): string {
		return filePath.replace(/\\/g, '/');
	}
}
