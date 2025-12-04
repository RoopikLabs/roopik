/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Import Scanner
 *
 * Scans component code for imports and categorizes them.
 * Used to detect dependencies and validate self-containment.
 */

import type { CategorizedImports } from './importTypes.js';

/**
 * Scans code for imports and categorizes them
 */
export class ImportScanner {

	/** Supported component extensions that we block (must be self-contained) */
	private static readonly COMPONENT_EXTENSIONS = ['.tsx', '.jsx', '.vue', '.svelte'];

	/** Supported style extensions */
	private static readonly STYLE_EXTENSIONS = ['.css', '.scss', '.sass', '.less'];

	/** Supported script extensions (non-component) */
	private static readonly SCRIPT_EXTENSIONS = ['.js', '.ts', '.mjs', '.cjs'];

	/**
	 * Scan code for all local imports
	 * @param code - Source code to scan
	 * @returns Array of relative import paths (starting with . or ..)
	 */
	scanImports(code: string): string[] {
		const imports: string[] = [];
		const seen = new Set<string>();

		// ES6 imports: import X from './file' or import './file'
		const esImportRegex = /import\s+(?:[\w{},\s*]+\s+from\s+)?['"](\.[^'"]+)['"]/g;

		// Dynamic imports: import('./file')
		const dynamicImportRegex = /import\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;

		// Require: require('./file')
		const requireRegex = /require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;

		// CSS @import: @import './file.css'
		const cssImportRegex = /@import\s+['"](\.[^'"]+)['"]/g;

		const patterns = [esImportRegex, dynamicImportRegex, requireRegex, cssImportRegex];

		for (const regex of patterns) {
			let match;
			while ((match = regex.exec(code)) !== null) {
				const importPath = match[1];
				if (!seen.has(importPath)) {
					seen.add(importPath);
					imports.push(importPath);
				}
			}
		}

		return imports;
	}

	/**
	 * Categorize imports by type
	 * @param imports - Array of import paths
	 * @returns Categorized imports object
	 */
	categorizeImports(imports: string[]): CategorizedImports {
		const result: CategorizedImports = {
			css: [],
			js: [],
			components: [],
			packages: []
		};

		for (const importPath of imports) {
			// Check if it's a relative import (local file)
			if (this.isRelativeImport(importPath)) {
				// Get extension (handle extensionless imports)
				const ext = this.getExtension(importPath);

				if (ImportScanner.STYLE_EXTENSIONS.some(e => ext === e)) {
					result.css.push(importPath);
				} else if (ImportScanner.COMPONENT_EXTENSIONS.some(e => ext === e)) {
					result.components.push(importPath);
				} else if (ImportScanner.SCRIPT_EXTENSIONS.some(e => ext === e)) {
					result.js.push(importPath);
				} else if (!ext) {
					// Extensionless import - could be .js or .ts
					// We'll try to resolve it in the ImportService
					result.js.push(importPath);
				}
			} else {
				// Package import (handled by CDN)
				result.packages.push(importPath);
			}
		}

		return result;
	}

	/**
	 * Convenience method: scan and categorize in one call
	 */
	scanAndCategorize(code: string): CategorizedImports {
		const imports = this.scanImports(code);
		return this.categorizeImports(imports);
	}

	/**
	 * Check if import path is relative (starts with . or ..)
	 */
	private isRelativeImport(importPath: string): boolean {
		return importPath.startsWith('./') || importPath.startsWith('../');
	}

	/**
	 * Get file extension from import path
	 */
	private getExtension(importPath: string): string {
		const lastDotIndex = importPath.lastIndexOf('.');
		const lastSlashIndex = Math.max(importPath.lastIndexOf('/'), importPath.lastIndexOf('\\'));

		// No dot or dot is before the last slash (part of directory name)
		if (lastDotIndex === -1 || lastDotIndex < lastSlashIndex) {
			return '';
		}

		return importPath.substring(lastDotIndex).toLowerCase();
	}

	/**
	 * Validate that component is self-contained (no component imports)
	 * @param code - Source code to validate
	 * @returns Object with valid flag and any component dependencies found
	 */
	validateSelfContained(code: string): { valid: boolean; componentDeps: string[] } {
		const categorized = this.scanAndCategorize(code);

		return {
			valid: categorized.components.length === 0,
			componentDeps: categorized.components
		};
	}
}
