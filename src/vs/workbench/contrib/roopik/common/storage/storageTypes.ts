/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Component Pipeline V2 - Storage Types
 *
 * Metadata-only architecture:
 * - .roopik/canvases.json: Canvas registry (lightweight)
 * - .roopik/canvases/{canvas-id}.json: All components for one canvas (references only!)
 * - AppData: Build cache (bundles, not in workspace)
 *
 * No file copying. No ComponentMeta per component. Just references to original locations.
 */

// ============================================================================
// Supported Frameworks
// ============================================================================

/**
 * Supported frameworks
 */
export type Framework = 'react' | 'vue' | 'svelte' | 'solid' | 'preact' | 'html' | 'unknown';

// ============================================================================
// Build Cache (App Data Storage)
// ============================================================================

/**
 * Bundled output stored in app data cache
 */
export interface BundledOutput {
	/** Bundled JavaScript code (ready to run in sandbox) */
	bundledCode: string;

	/** Build metadata */
	buildMeta: BuildMeta;
}

/**
 * Build metadata stored in build.json
 */
export interface BuildMeta {
	/** Component ID this build belongs to */
	componentId: string;

	/** Canvas ID */
	canvasId: string;

	/** Hash of source files used for this build */
	sourceHash: string;

	/** CDN URLs for external dependencies */
	cdnUrls: string[];

	/** Build time in milliseconds */
	buildTime: number;

	/** Bundle size in bytes */
	bundleSize: number;

	/** When this build was created */
	builtAt: number;
}

// ============================================================================
// Canvas Preferences (UI State - managed by Extension)
// ============================================================================

/**
 * Canvas UI preferences
 * These are stored per-canvas in index.json and managed by the Extension.
 * Core only sets default values on canvas creation.
 *
 * Note: Viewport (zoom/pan) is NOT persisted - auto-fit on load is preferred.
 */
export interface CanvasPreferences {
	/** Background color (hex) */
	backgroundColor: string;

	/** Background pattern */
	backgroundPattern: 'grid' | 'dots' | 'plain';
}

/**
 * Default canvas preferences
 * Used when creating a new canvas
 */
export const DEFAULT_CANVAS_PREFERENCES: CanvasPreferences = {
	backgroundColor: '#1e1e1e',
	backgroundPattern: 'dots'
};

// ============================================================================
// Canvas & Component Types (2-Level Metadata Architecture)
// ============================================================================

/**
 * Canvas information in registry (canvases.json)
 * Quick listing without reading individual canvas files
 */
export interface CanvasInfo {
	id: string;
	name: string;
	createdAt: number;
	updatedAt: number;
}

/**
 * Canvas registry (.roopik/canvases.json)
 * Lightweight, just lists all canvases
 */
export interface CanvasRegistry {
	canvases: CanvasInfo[];
}

/**
 * Sandbox position on the infinite canvas
 */
export interface SandboxPosition {
	/** X coordinate on canvas */
	x: number;

	/** Y coordinate on canvas */
	y: number;

	/** Z-index for overlap ordering in free mode */
	zIndex: number;
}

/**
 * Component reference stored in canvas.json
 *
 * Key insight: This is a REFERENCE to component's original location,
 * NOT a copy of the source files!
 *
 * folderPath + entryFile tell us where to find the original source.
 * We read from there during build, watch that folder, etc.
 */
export interface ComponentReference {
	/** Display name (optional) */
	name?: string;

	/** Workspace-relative folder path ("/src/components/Button") */
	folderPath: string;

	/** Entry file (relative to folderPath, e.g., "Button.tsx") */
	entryFile: string;

	buildState: BuildState;

	contentHash: string;

	/** Detected framework */
	framework: Framework;

	/** Position on canvas (optional - assigned on first add) */
	position?: SandboxPosition;

	/** Origin hint: 'local' | 'ai' | 'figma' | 'github' (informational only) */
	origin?: string;

	/** Creation timestamp */
	createdAt: number;

	/** Last update timestamp */
	updatedAt: number;
}

/**
 * Canvas file (.roopik/canvases/{canvas-id}.json)
 *
 * All-in-one file for one canvas:
 * - Canvas metadata
 * - Canvas preferences (UI state)
 * - All component references for this canvas
 *
 * Clean, atomic structure. Load once, get everything.
 */
export interface CanvasFile {
	/** Canvas ID */
	id: string;

	/** Canvas name */
	name: string;

	/** Optional description */
	description?: string;

	/** Optional icon/color for UI */
	icon?: string;
	color?: string;

	/** Canvas creation timestamp */
	createdAt: number;

	/** Canvas last update */
	updatedAt: number;

	/** Canvas UI preferences (managed by Extension) */
	preferences: CanvasPreferences;

	/** All components in this canvas (id → reference) */
	components: Record<string, ComponentReference>;
}

/**
 * Build state for a component
 */
export type BuildState =
	| { status: 'pending' }
	| { status: 'building' }
	| { status: 'ready' }
	| { status: 'error'; error: string };

// ============================================================================
// Workspace Config
// ============================================================================

/**
 * Workspace configuration (.roopik/config.json)
 */
export interface WorkspaceConfig {
	/** Config version for migrations */
	version: number;

	/** Default canvas to open */
	defaultCanvas: string;

	/** Workspace settings */
	settings: {
		/** Auto-build on file change */
		autoBuild: boolean;

		/** Watch for file changes */
		watchFiles: boolean;

		/** CDN provider for dependencies */
		cdnProvider: 'esm.sh' | 'skypack' | 'unpkg';
	};
}

/**
 * Default workspace configuration
 */
export const DEFAULT_WORKSPACE_CONFIG: WorkspaceConfig = {
	version: 1,
	defaultCanvas: 'main',
	settings: {
		autoBuild: true,
		watchFiles: true,
		cdnProvider: 'esm.sh'
	}
};

// ============================================================================
// Project Storage Types (Mode 2 - Browser Preview)
// ============================================================================

/**
 * Project entry in registry (projects.json)
 * Minimal data needed for recent projects list
 */
export interface ProjectInfo {
	/** Unique project ID */
	id: string;

	/** Display name (e.g., "My React App" or folder name) */
	name: string;

	/** Workspace-relative path to project root (e.g., "apps/frontend" or ".") */
	path: string;

	/** Timestamp last opened (for recents sorting) */
	updatedAt: number;

	/** Framework identifier (e.g., "react-vite", "vue-vite", "nextjs") - optional */
	framework?: string;

	/** Human-readable framework name (e.g., "React + Vite", "Next.js") - optional */
	frameworkDisplayName?: string;
}

/**
 * Active dev server metadata (for session restoration and orphaned process cleanup)
 */
export interface ActiveProjectMetadata {
	/** Project ID */
	projectId: string;

	/** Process ID (for killing orphaned processes) */
	pid: number;

	/** Server port (for conflict detection) */
	port: number;

	/** Server URL */
	url: string;

	/** When server was started */
	startedAt: number;
}

/**
 * Project registry (.roopik/projects/projects.json)
 */
export interface ProjectIndex {
	/** Registry version for migrations */
	version: number;

	/** Active dev server (if any) - minimal metadata for cleanup */
	activeProject?: ActiveProjectMetadata;

	/** List of all projects opened in this workspace */
	projects: ProjectInfo[];
}

/**
 * Default project registry
 */
export const DEFAULT_PROJECT_INDEX: ProjectIndex = {
	version: 1,
	projects: []
};
