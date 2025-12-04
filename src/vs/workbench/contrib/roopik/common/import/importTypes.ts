/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Import Pipeline Types
 *
 * Types for importing components from external sources into the Canvas.
 */

import type { Framework, ComponentInput } from '../sandboxPipeline/types.js';

// ============================================
// Import Status Types
// ============================================

/**
 * Component status in staging
 */
export type ComponentStatus = 'imported' | 'modified' | 'exported';

/**
 * Import error codes
 */
export type ImportErrorCode =
	| 'UNSUPPORTED_FORMAT'
	| 'FOLDER_NOT_ALLOWED'
	| 'HAS_COMPONENT_DEPS'
	| 'MISSING_DEP'
	| 'PARSE_ERROR'
	| 'STAGING_ERROR'
	| 'FILE_NOT_FOUND'
	| 'DUPLICATE_COMPONENT'
	| 'ADAPTER_NOT_FOUND'
	| 'NETWORK_ERROR';

// ============================================
// Component Metadata Types
// ============================================

/**
 * Component metadata stored in _meta.json
 * Tracks import source, status, and dependencies
 */
export interface ComponentMeta {
	/** Original file path (for local imports) */
	originalPath: string;

	/** Import timestamp */
	importedAt: number;

	/** Resolved dependencies (.css, .js files) */
	dependencies: string[];

	/** Detected framework */
	framework: Framework;

	/** Current status */
	status: ComponentStatus;

	/** Canvas ID this component belongs to */
	canvasId: string;

	/** Sandbox ID in the canvas */
	sandboxId?: string;

	/** Last export timestamp (if exported) */
	exportedAt?: number;

	/** Last modification timestamp */
	modifiedAt?: number;
}

// ============================================
// Import Request/Response Types
// ============================================

/**
 * Import component request
 */
export interface ImportRequest {
	/** File path to import */
	path: string;

	/** Canvas ID to import into */
	canvasId: string;

	/** Optional drop position */
	position?: { x: number; y: number };
}

/**
 * Successful import result
 */
export interface ImportSuccess {
	success: true;

	/** Generated component input for sandbox pipeline */
	componentInput: ComponentInput;

	/** Path to staging directory */
	stagingPath: string;

	/** Component metadata */
	meta: ComponentMeta;
}

/**
 * Failed import result
 */
export interface ImportError {
	success: false;

	/** Error code for programmatic handling */
	code: ImportErrorCode;

	/** Human-readable error message */
	message: string;

	/** Additional details (e.g., list of component dependencies) */
	details?: unknown;
}

/**
 * Duplicate detection info
 */
export interface DuplicateInfo {
	isDuplicate: true;
	existingName: string;
	existingMeta: ComponentMeta;
}

/**
 * Import error with duplicate information
 */
export interface ImportDuplicateError extends ImportError {
	code: 'DUPLICATE_COMPONENT';
	duplicateInfo: DuplicateInfo;
}

/**
 * Import result union type
 */
export type ImportResult = ImportSuccess | ImportError | ImportDuplicateError;

// ============================================
// Dependency Scan Types
// ============================================

/**
 * Categorized imports from scanning
 */
export interface CategorizedImports {
	/** .css and .scss imports */
	css: string[];

	/** .js and .ts imports (not components) */
	js: string[];

	/** .tsx, .jsx, .vue, .svelte imports (other components - blocked) */
	components: string[];

	/** npm packages (handled by CDN) */
	packages: string[];
}

// ============================================
// Export Types
// ============================================

/**
 * Export mode options
 */
export type ExportMode = 'replace' | 'saveas' | 'clipboard';

/**
 * Export request
 */
export interface ExportRequest {
	/** Canvas ID */
	canvasId: string;

	/** Component name (folder name in staging) */
	componentName: string;

	/** Export mode */
	mode: ExportMode;

	/** Target path (for 'replace' and 'saveas' modes) */
	targetPath?: string;
}

/**
 * Export result
 */
export interface ExportResult {
	success: boolean;
	message: string;
	path?: string;
}

// ============================================
// Adapter Pattern Interfaces
// ============================================

/**
 * Options passed to adapters
 */
export interface AdapterOptions {
	/** Override framework detection */
	framework?: Framework;
	/** Override entry file detection */
	entryFile?: string;
	/** Additional dependencies to include */
	dependencies?: Record<string, string>;
	/** Canvas ID for staging */
	canvasId?: string;
	/** Force replace existing */
	forceReplace?: boolean;
}

/**
 * Adapter source types - used to identify adapters
 */
export type AdapterSourceType = 'local-file' | 'github' | 'figma' | 'ai-agent' | 'ui-library';

/**
 * Component Import Adapter Interface
 *
 * All import sources (local files, GitHub, Figma, AI, UI libraries)
 * implement this interface to produce unified ComponentInput.
 */
export interface IComponentImportAdapter {
	/** Unique adapter identifier */
	readonly id: AdapterSourceType;

	/** Human-readable name for UI */
	readonly displayName: string;

	/** Supported file extensions (for local adapter) or URL patterns */
	readonly supportedTypes: string[];

	/**
	 * Import component from source and normalize to ComponentInput
	 * @param source - Source-specific input (file path, URL, design ID, etc.)
	 * @param options - Adapter-specific options
	 * @returns Import result with ComponentInput if successful
	 */
	import(source: string, options?: AdapterOptions): Promise<ImportResult>;

	/**
	 * Check if the adapter can handle this source
	 * @param source - Source path/URL to check
	 */
	canHandle(source: string): boolean;

	/**
	 * Check for duplicate import (same source already imported)
	 * @param canvasId - Canvas to check
	 * @param source - Original source path/URL
	 */
	checkForDuplicate?(canvasId: string, source: string): Promise<DuplicateInfo | null>;
}

// ============================================
// Service Interface
// ============================================

/**
 * Import Service interface - Orchestrator that uses adapters
 */
export interface IImportService {
	/**
	 * Import a component from a file path
	 */
	importComponent(request: ImportRequest): Promise<ImportResult>;

	/**
	 * Export a component from staging
	 */
	exportComponent(request: ExportRequest): Promise<ExportResult>;

	/**
	 * Update component status (e.g., mark as modified)
	 */
	updateComponentStatus(canvasId: string, componentName: string, status: ComponentStatus): Promise<void>;

	/**
	 * Get component metadata
	 */
	getComponentMeta(canvasId: string, componentName: string): Promise<ComponentMeta | null>;

	/**
	 * List all components in a canvas staging area
	 */
	listStagedComponents(canvasId: string): Promise<ComponentMeta[]>;

	/**
	 * Delete a staged component
	 */
	deleteStagedComponent(canvasId: string, componentName: string): Promise<boolean>;
}
