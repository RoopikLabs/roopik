/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Component Types
 *
 * These types mirror the Core's component types.
 * They are used for type-safe communication between Extension and Core.
 */

/**
 * Component framework (matches Core)
 */
export type ComponentFramework = 'react' | 'vue' | 'svelte' | 'solid' | 'preact' | 'unknown';

/**
 * Component build state (matches Core)
 */
export type ComponentBuildState = 'building' | 'ready' | 'error';

/**
 * Component - Full component data (matches Core)
 */
export interface Component {
	/** Unique identifier */
	id: string;

	/** Parent canvas */
	canvasId: string;

	/** Workspace-relative path to component folder */
	folderPath: string;

	/** Entry file (relative to folderPath) */
	entryFile: string;

	/** Detected framework */
	framework: ComponentFramework;

	/** Current build state */
	buildState: { status: ComponentBuildState; error?: string };

	/** Hash of source files (for cache) */
	contentHash: string;

	/** Display name for the component */
	componentName?: string;

	/** Origin hint: 'local' | 'ai' | 'figma' | 'github' */
	origin?: string;

	/** Creation timestamp */
	createdAt: number;

	/** Last update timestamp */
	updatedAt: number;

	/**
	 * Position on canvas (managed by extension/webview)
	 * Note: width/height not stored - all sandboxes use DEFAULT_CONFIG dimensions
	 */
	position?: {
		x: number;
		y: number;
		zIndex?: number;
	};
}

/**
 * Request to add a component (matches Core's AddComponentRequest)
 *
 * Extension only needs to provide:
 * - folderPath: Path to component folder OR file (Core handles smart parsing)
 * - canvasId: Target canvas (we're dragging on a canvas, so we know this)
 * - componentName: Optional display name (Core derives from entry file if not provided)
 * - origin: Optional hint like 'local' or 'drag-drop' (informational only)
 *
 * Core handles everything else:
 * - Auto-detects entry file if not provided
 * - Auto-detects framework from imports
 * - Computes content hash
 * - Creates new canvas if canvasId not provided (but extension always provides it)
 */
export interface AddComponentRequest {
	/**
	 * Path to component folder OR file (REQUIRED)
	 * - If file path: "C:\src\Button\Button.tsx" → Core extracts folder + entry
	 * - If folder path: "C:\src\Button" → Core auto-detects entry file
	 */
	folderPath: string;

	/**
	 * Target canvas ID (REQUIRED for extension - we're always dragging on a canvas)
	 */
	canvasId: string;

	/**
	 * Display name for the component (optional)
	 * Core derives from entry file if not provided: "button.tsx" → "Button"
	 */
	componentName?: string;

	/**
	 * Entry file relative to folderPath (optional)
	 * Core auto-detects if not provided: index.tsx > index.ts > {folderName}.tsx
	 */
	entryFile?: string;

	/**
	 * Framework hint (optional)
	 * Core auto-detects from imports if not provided
	 */
	framework?: ComponentFramework;

	/**
	 * Origin hint: 'local' | 'drag-drop' | 'ai' | 'figma' | 'github'
	 * Informational only - doesn't change processing flow
	 */
	origin?: string;
}

/**
 * Build result (success case)
 */
export interface BuildResult {
	/** Bundled JavaScript code */
	bundledCode: string;

	/** CDN URLs for dependencies */
	cdnUrls: string[];

	/** Detected/used framework */
	framework: ComponentFramework;

	/** Resolved dependencies with versions */
	resolvedDependencies: Record<string, string>;

	/** Build time in milliseconds */
	buildTime: number;

	/** Bundle size in bytes */
	bundleSize: number;

	/** Path to the bundle file (for extension to read directly) */
	bundlePath?: string;
}

/**
 * Build error info (failure case)
 */
export interface BuildErrorInfo {
	/** Error message */
	message: string;

	/** Error code (for categorization) */
	code?: string;

	/** File that caused the error */
	file?: string;

	/** Line number */
	line?: number;

	/** Column number */
	column?: number;

	/** Stack trace */
	stack?: string;
}
