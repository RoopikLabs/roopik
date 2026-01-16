/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { Framework } from '../storage/storageTypes.js';

// ============================================================================
// Build Input/Output Types
// ============================================================================

/**
 * Input for building a component
 */
export interface BuildInput {
	/** Component ID (for logging) */
	id: string;

	/** Source files (filename → content) */
	files: Record<string, string>;

	/** Entry file (relative) */
	entryFile?: string;

	/** Framework (auto-detected if not provided) */
	framework?: Framework;

	/** NPM dependencies with versions */
	dependencies?: Record<string, string>;
}

/**
 * Result from building a component
 */
export interface BuildOutput {
	/** Bundled JavaScript code */
	bundledCode: string;

	/** CDN URLs for external dependencies */
	cdnUrls: string[];

	/** Detected/used framework */
	framework: Framework;

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

	/** Build time in ms */
	buildTime: number;

	/** Bundle size in bytes */
	bundleSize: number;

	/** Detected styling libraries for conditional CSS injection */
	styling?: {
		usesTailwind: boolean;
		usesShadcn: boolean;
		detectedLibraries: string[];
	};
}

// ============================================================================
// Service Interface
// ============================================================================

export const IBuildService = createDecorator<IBuildService>('roopikBuildService');

/**
 * Build Service Interface
 *
 * Pure build service - takes source files, returns bundled code.
 * Does NOT handle storage - caller decides what to do with output.
 *
 * Responsibilities:
 * - Bundle source files with ESBuild
 * - Apply script injectors (error boundary, inspect mode, etc.)
 * - Resolve CDN URLs for dependencies
 */
export interface IBuildService {
	readonly _serviceBrand: undefined;

	/**
	 * Build component from source files
	 *
	 * Flow:
	 * 1. Detect framework (if not provided)
	 * 2. Bundle with ESBuild
	 * 3. Apply script injectors
	 * 4. Return BuildOutput
	 *
	 * Caller is responsible for storing the output.
	 */
	build(input: BuildInput): Promise<BuildOutput>;
}
