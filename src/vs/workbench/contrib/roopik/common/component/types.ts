/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Component Pipeline V2 - Component Types
 *
 * Simplified architecture:
 * - AddComponentRequest: Just name, folderPath, entryFile, origin (optional auto-detect)
 * - No ImportResult needed (we don't transform source anymore)
 * - Component: Runtime in-memory state (with folderPath instead of storagePath)
 */

import { Framework, BuildState } from '../storage/storageTypes.js';

// ============================================================================
// Component (Runtime State)
// ============================================================================

/**
 * Component as seen by Core services
 *
 * Key change: folderPath instead of storagePath
 * This points to the ORIGINAL location, not a copy in .roopik/
 */
export interface Component {
	/** Unique ID */
	id: string;

	/** Display name */
	name?: string;

	/** Parent canvas */
	canvasId: string;

	/** Workspace-relative path to component folder ("/src/components/Button") */
	folderPath: string;

	/** Entry file (relative to folderPath, e.g., "Button.tsx") */
	entryFile?: string;

	/** Detected framework */
	framework?: Framework;

	/** Current build state */
	buildState?: BuildState;

	/** Hash of source files (for cache) */
	contentHash?: string;

	/** Origin hint: 'local' | 'ai' | 'figma' | 'github' (informational) */
	origin?: string;

	/** Timestamps */
	createdAt: number;
	updatedAt: number;
}

// ============================================================================
// Add Component Request (Minimal!)
// ============================================================================

/**
 * Request to add a component to a canvas
 *
 * Simple and clean:
 * 1. Point to component folder (original location!)
 * 2. Specify entry file (or auto-detect)
 * 3. Optional: provide origin for info (doesn't change flow)
 */
export interface AddComponentRequest {
	/** Display name */
	name: string;

	/** Target canvas (if not provided, uses active canvas) */
	canvasId?: string;

	/** Workspace-relative path to component folder ("/src/components/Button") */
	folderPath: string;

	/** Entry file relative to folderPath (e.g., "Button.tsx") - auto-detect if not provided */
	entryFile?: string;

	/** Origin hint: 'local' | 'ai' | 'figma' | 'github' (informational only, doesn't change flow) */
	origin?: string;
}

// ============================================================================
// Build Result & Errors
// ============================================================================

/**
 * Result from BuildService after building a component (success case)
 */
export interface BuildResult {
	/** Bundled JavaScript code */
	bundledCode: string;

	/** CDN URLs for dependencies */
	cdnUrls: string[];

	/** Build time in ms */
	buildTime: number;

	/** Bundle size in bytes */
	bundleSize: number;

	/** Path to the bundle file (for extension to read directly) */
	bundlePath?: string;
}

/**
 * Location of an error in source code
 */
export interface BuildErrorLocation {
	/** File path (relative to component folder) */
	file: string;

	/** Line number (1-indexed) */
	line: number;

	/** Column number (1-indexed) */
	column: number;

	/** Length of the error span */
	length?: number;

	/** The source line text */
	lineText?: string;
}

/**
 * Structured build error with source location
 *
 * Used for displaying errors on component cards and in editor.
 * ESBuild provides rich error info that we preserve.
 */
export interface BuildError {
	/** Error message (human readable) */
	message: string;

	/** Error category */
	category: 'syntax' | 'type' | 'import' | 'transform' | 'unknown';

	/** Location in source code (if available) */
	location?: BuildErrorLocation;

	/** Additional notes/hints from ESBuild */
	notes?: string[];

	/** Stack trace (for runtime errors during transform) */
	stack?: string;
}

/**
 * Full error info for a failed build
 *
 * A build can have multiple errors (e.g., multiple syntax errors).
 * The primary error is first, additional errors follow.
 */
export interface BuildErrorInfo {
	/** Primary error message (for quick display) */
	message: string;

	/** All errors encountered */
	errors: BuildError[];

	/** Build time before failure (ms) */
	buildTime: number;
}
