/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
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
	| 'FILE_NOT_FOUND';

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
 * Import result union type
 */
export type ImportResult = ImportSuccess | ImportError;

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
// Service Interface
// ============================================

/**
 * Import Service interface
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
