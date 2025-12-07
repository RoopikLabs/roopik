/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Build Types
 *
 * Types used by the ESBuild transformer and component parser.
 * These are internal types for the build process.
 */

import { Framework } from '../storage/storageTypes.js';

// Re-export Framework for convenience
export { Framework };

// ============================================================================
// Component Input/Output Types
// ============================================================================

/**
 * Input for the transformer
 */
export interface ComponentInput {
	/** Component ID (for logging/tracking) */
	id: string;

	/** Source files (filename → content) */
	files: Record<string, string>;

	/** Entry file (relative, auto-detected if not provided) */
	entryFile?: string;

	/** Framework (auto-detected if not provided) */
	framework?: Framework;

	/** NPM dependencies with versions */
	dependencies?: Record<string, string>;
}

/**
 * Output from the transformer
 */
export interface TransformedComponent {
	/** Component ID */
	id: string;

	/** Detected/used framework */
	framework: Framework;

	/** Bundled JavaScript code */
	bundledCode: string;

	/** CDN URLs for external dependencies */
	cdnUrls: string[];

	/**
	 * Resolved dependencies with actual versions used
	 *
	 * This may differ from input dependencies:
	 * - If input had no dependencies, these are the detected/fallback versions
	 * - If input had wrong versions, these are the corrected versions
	 * - If esm.sh resolved to latest, these reflect that
	 *
	 * Caller can save these in metadata for deterministic rebuilds.
	 */
	resolvedDependencies: Record<string, string>;

	/** Build metadata */
	metadata: {
		/** Bundle size in bytes */
		size: number;

		/** Transform time in ms */
		transformTime: number;
	};
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Validation result from component parser
 */
export interface ValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

// ============================================================================
// Framework Configuration Types
// ============================================================================

/**
 * Framework-specific build configuration
 */
export interface FrameworkConfig {
	/** File extensions this framework uses */
	extensions: string[];

	/** ESBuild loader to use */
	loader: string;

	/** Common entry file names */
	entryFileNames: string[];
}

/**
 * Map of all framework configurations
 */
export type FrameworkConfigMap = Record<Framework, FrameworkConfig>;
