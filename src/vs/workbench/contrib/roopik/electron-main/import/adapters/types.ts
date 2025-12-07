/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Import Adapter Types
 *
 * Base types and abstract class for import adapters.
 */

import { ComponentSource } from '../../../common/storage/storageTypes.js';
import { SourceData, ImportResult } from '../../../common/component/types.js';
import { IImportAdapter } from '../../../common/import/importService.js';

// Re-export for convenience
export { IImportAdapter };

/**
 * Base class for import adapters
 *
 * Provides common functionality and enforces the adapter contract.
 */
export abstract class BaseImportAdapter implements IImportAdapter {
	abstract readonly sourceType: ComponentSource;

	/**
	 * Default implementation - checks if sourceData.type matches this adapter's sourceType
	 */
	canHandle(sourceData: SourceData): boolean {
		return sourceData.type === this.sourceType;
	}

	abstract import(sourceData: SourceData): Promise<ImportResult>;

	/**
	 * Helper: Detect dependencies from import statements in code
	 */
	protected detectDependencies(code: string): Record<string, string> {
		const deps: Record<string, string> = {};

		// Match: import ... from 'package-name'
		// Match: import 'package-name'
		const importRegex = /import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^./][^'"]+)['"]/g;

		let match;
		while ((match = importRegex.exec(code)) !== null) {
			const importPath = match[1];

			// Parse package name (handle scoped packages)
			let packageName: string;
			if (importPath.startsWith('@')) {
				// Scoped: @scope/name or @scope/name/subpath
				const parts = importPath.split('/');
				packageName = `${parts[0]}/${parts[1]}`;
			} else {
				// Regular: name or name/subpath
				packageName = importPath.split('/')[0];
			}

			// Don't override if already detected (first occurrence wins)
			if (!deps[packageName]) {
				// Leave version empty - BuildService will resolve
				deps[packageName] = '';
			}
		}

		return deps;
	}

	/**
	 * Helper: Detect dependencies from multiple files
	 */
	protected detectDependenciesFromFiles(files: Record<string, string>): Record<string, string> {
		const allDeps: Record<string, string> = {};

		for (const content of Object.values(files)) {
			const fileDeps = this.detectDependencies(content);
			Object.assign(allDeps, fileDeps);
		}

		return allDeps;
	}

	/**
	 * Helper: Get file extension
	 */
	protected getExtension(filename: string): string {
		const lastDot = filename.lastIndexOf('.');
		return lastDot >= 0 ? filename.slice(lastDot) : '';
	}

	/**
	 * Helper: Infer filename from code content if not provided
	 */
	protected inferFilename(code: string, framework: string): string {
		// Check for JSX/TSX indicators
		const hasJsx = /<[A-Z][a-zA-Z]*|<\/[a-zA-Z]/.test(code);
		const hasTypeScript = /:\s*(string|number|boolean|any|void|never|unknown)[\s,)\]]|interface\s+\w+|type\s+\w+\s*=/.test(code);

		if (hasTypeScript && hasJsx) {
			return 'Component.tsx';
		} else if (hasJsx) {
			return 'Component.jsx';
		} else if (hasTypeScript) {
			return 'Component.ts';
		}

		// Framework-specific defaults
		switch (framework) {
			case 'vue':
				return 'Component.vue';
			case 'svelte':
				return 'Component.svelte';
			default:
				return 'Component.jsx';
		}
	}
}
