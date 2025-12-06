/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Component Pipeline V2 - Component Types
 *
 * Types for component creation requests and runtime component state.
 * Storage-related types are in ../storage/storageTypes.ts
 */

import { ComponentSource, SourceInfo, Framework, BuildState } from '../storage/storageTypes.js';

// ============================================================================
// Component (Runtime State)
// ============================================================================

/**
 * Component as seen by Core services
 * This is the in-memory representation with full state
 */
export interface Component {
	/** Unique ID (also folder name) */
	id: string;

	/** Display name */
	name: string;

	/** Parent canvas */
	canvasId: string;

	/** How the component was created */
	source: ComponentSource;

	/** Additional source info */
	sourceInfo?: SourceInfo;

	/** Absolute path to component folder in workspace */
	storagePath: string;

	/** Main entry file (relative) */
	entryFile: string;

	/** All source files (relative) */
	files: string[];

	/** Framework */
	framework: Framework;

	/** NPM dependencies */
	dependencies: Record<string, string>;

	/** Current build state */
	buildState: BuildState;

	/** Hash of source files (for cache) */
	contentHash: string;

	/** Timestamps */
	createdAt: number;
	updatedAt: number;
}

// ============================================================================
// Create Requests
// ============================================================================

/**
 * Request to create a new component
 */
export interface CreateComponentRequest {
	/** Display name */
	name: string;

	/** Target canvas (if not provided, uses active canvas) */
	canvasId?: string;

	/** Source type */
	source: ComponentSource;

	/** Source-specific data */
	sourceData: SourceData;

	/** Override detected framework */
	framework?: Framework;

	/** Additional dependencies */
	dependencies?: Record<string, string>;
}

/**
 * Source-specific data for component creation
 */
export type SourceData =
	| AIAgentSourceData
	| LocalFileSourceData
	| GitHubSourceData
	| FigmaSourceData
	| ManualSourceData;

/**
 * AI Agent generated code
 */
export interface AIAgentSourceData {
	type: 'ai-agent';
	/** Single file content */
	code: string;
	/** Or multiple files */
	files?: Record<string, string>;
	/** Prompt ID for tracking */
	promptId?: string;
	/** Model used */
	model?: string;
}

/**
 * Import from local file in user's project
 */
export interface LocalFileSourceData {
	type: 'local-file';
	/** Absolute path to file */
	filePath: string;
}

/**
 * Import from GitHub
 */
export interface GitHubSourceData {
	type: 'github';
	/** Repository URL */
	repoUrl: string;
	/** Path to file in repo */
	filePath: string;
	/** Branch (default: main) */
	branch?: string;
}

/**
 * Import from Figma design
 */
export interface FigmaSourceData {
	type: 'figma';
	/** Figma file ID */
	fileId: string;
	/** Node ID */
	nodeId: string;
}

/**
 * Create blank component manually
 */
export interface ManualSourceData {
	type: 'manual';
	/** Framework to use */
	framework: Framework;
	/** Template type */
	template?: 'blank' | 'basic' | 'with-state';
}

// ============================================================================
// Import Result
// ============================================================================

/**
 * Result from ImportService after processing a source
 */
export interface ImportResult {
	/** Source files (filename → content) */
	files: Record<string, string>;

	/** Main entry file */
	entryFile: string;

	/** Detected framework */
	framework: Framework;

	/** Detected dependencies */
	dependencies: Record<string, string>;

	/** Source info for metadata */
	sourceInfo: SourceInfo;
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
