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
// Runtime Error (from canvas rendering)
// ============================================================================

/**
 * Runtime error captured from canvas sandbox.
 *
 * When a component crashes at runtime (not during build), the error boundary
 * in the sandbox catches it and sends it back to the extension, which forwards
 * it to core. This allows AI agents to see runtime errors via getComponentInfo().
 *
 * Note: This is separate from BuildErrorInfo which captures build-time errors.
 */
export interface RuntimeError {
	/** Error message */
	message: string;

	/** Error type: 'runtime' (window.onerror) or 'promise' (unhandled rejection) */
	type: 'runtime' | 'promise' | 'unknown';

	/** Stack trace if available */
	stack?: string;

	/** Source file where error occurred (if available) */
	source?: string;

	/** Line number where error occurred (if available) */
	line?: number;

	/** Column number where error occurred (if available) */
	column?: number;

	/** Timestamp when error was captured */
	timestamp: number;
}

// ============================================================================
// Component (Runtime State)
// ============================================================================

/**
 * Component as seen by Core services (Runtime state)
 *
 * This represents a fully-resolved component after addComponent() completes.
 * All required fields ARE present (resolved from input + auto-detection).
 *
 * Key change from V1: folderPath instead of storagePath
 * This points to the ORIGINAL location, not a copy in .roopik/
 */
export interface Component {
	/** Unique ID */
	id: string;

	/** Parent canvas */
	canvasId: string;

	/** Workspace-relative path to component folder ("/src/components/Button") */
	folderPath: string;

	/** Entry file (relative to folderPath, e.g., "Button.tsx") - always resolved */
	entryFile: string;

	/** Detected framework - always resolved */
	framework: Framework;

	/** Current build state - always present */
	buildState: BuildState;

	/** Hash of source files (for cache) - always computed */
	contentHash: string;

	/** Display name for the component (e.g., "Button", "Card") */
	componentName?: string;

	/** Origin hint: 'local' | 'ai' | 'figma' | 'github' (informational) */
	origin?: string;

	/**
	 * Runtime error from canvas rendering (if any).
	 * Set when the component crashes at runtime in the sandbox.
	 * Cleared on successful rebuild.
	 */
	runtimeError?: RuntimeError;

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
 * Pipeline architecture - only folderPath is required, rest is auto-resolved:
 * 1. folderPath: Can be folder OR file path (smart parsing extracts both)
 * 2. entryFile: Auto-detected if not provided (index.tsx, {folderName}.tsx, etc.)
 * 3. componentName: Derived from entryFile if not provided (capitalized)
 * 4. canvasId: Uses active canvas, or creates new canvas if none available
 * 5. framework: Auto-detected from imports
 * 6. origin: Informational only, doesn't change flow
 *
 * This design supports:
 * - UI file picker (user selects file → extracts folder + entry)
 * - AI agents passing folder paths (auto-detects entry file)
 * - AI agents passing file paths (extracts folder + entry)
 * - AI agents with full context (can provide all fields)
 */
export interface AddComponentRequest {
	/**
	 * Path to component folder OR file (REQUIRED)
	 *
	 * Smart parsing handles both:
	 * - Folder path: "/src/components/Button/" → auto-detect entry file
	 * - File path: "/src/components/Button/Button.tsx" → extracts folder + entry
	 */
	folderPath: string;

	/**
	 * Entry file relative to folderPath (e.g., "Button.tsx")
	 * Auto-detected if not provided: index.tsx > index.ts > {folderName}.tsx > {folderName}.ts
	 */
	entryFile?: string;

	/**
	 * Display name for the component (e.g., "Primary Button")
	 * Auto-derived from entryFile if not provided: "button.tsx" → "Button"
	 */
	componentName?: string;

	/**
	 * Target canvas ID
	 * Resolution: provided > active canvas > create new canvas with componentName
	 * AI agents can pass this, but it's optional - we handle fallbacks gracefully
	 */
	canvasId?: string;

	/**
	 * Framework hint (react, vue, svelte, etc.)
	 * Auto-detected from imports if not provided.
	 * Invalid values will be ignored and trigger auto-detection.
	 */
	framework?: string; // Accepts any string, validated at runtime

	/**
	 * Origin hint: 'local' | 'ai' | 'figma' | 'github'
	 * Informational only - doesn't change processing flow
	 */
	origin?: string;

	/**
	 * Unique component ID (auto-generated if not provided)
	 * Rarely needed - mainly for deterministic testing or migrations
	 */
	componentId?: string;
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

// ============================================================================
// Component Info (Unified view for AI agents)
// ============================================================================

/**
 * Unified component information for AI agents
 *
 * Single call to get everything an agent needs:
 * - Component metadata
 * - Build status (building/ready/error)
 * - Error details if build failed
 * - Cache status
 * - CDN URLs for dependencies
 *
 * This reduces round trips - agent gets full context in one call.
 */
export interface ComponentInfo {
	/** Component ID */
	id: string;

	/** Parent canvas ID */
	canvasId: string;

	/** Display name */
	componentName?: string;

	/** Workspace-relative folder path */
	folderPath: string;

	/** Entry file (relative to folderPath) */
	entryFile: string;

	/** Detected framework */
	framework: Framework;

	/** Origin hint */
	origin?: string;

	/** Timestamps */
	createdAt: number;
	updatedAt: number;

	// === Build Status ===

	/** Current build status: 'building' | 'ready' | 'error' */
	buildStatus: 'building' | 'ready' | 'error';

	/** Is component currently in build queue? */
	isBuilding: boolean;

	/** Error message if build failed (null if success or building) */
	buildError: string | null;

	/** Structured error info if available */
	buildErrorInfo?: BuildErrorInfo;

	// === Cache Status ===

	/** Is the cached bundle valid (matches current content hash)? */
	cacheValid: boolean;

	/** Content hash of source files */
	contentHash: string;

	// === Build Output (only if build succeeded and cache valid) ===

	/** CDN URLs for dependencies (empty if not built) */
	cdnUrls: string[];

	/** Last build time in ms (0 if not built) */
	lastBuildTime: number;

	/** Bundle size in bytes (0 if not built) */
	bundleSize: number;

	/** When the component was last built (0 if never) */
	lastBuiltAt: number;

	// === Runtime Status (from canvas rendering) ===

	/**
	 * Runtime error from canvas rendering (if any).
	 * This is set when the component crashes at runtime in the sandbox.
	 * AI agents can use this to detect runtime issues not caught during build.
	 * Null means no runtime error (either not rendered yet or rendered successfully).
	 */
	runtimeError: RuntimeError | null;
}
