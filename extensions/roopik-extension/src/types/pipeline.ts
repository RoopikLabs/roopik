/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pipeline Types - Mirrors Core's sandboxPipeline/types.ts
 *
 * These types define the contract between Extension and Core's pipeline.
 * Keep in sync with: src/vs/workbench/contrib/roopik/common/sandboxPipeline/types.ts
 */

// ============================================
// Framework Types
// ============================================

export type Framework = 'react' | 'vue' | 'svelte' | 'solid' | 'preact' | 'html';
export type ComponentSource = 'ai' | 'user' | 'upload' | 'import' | 'sample';
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type JobPriority = 'high' | 'normal' | 'low';

// ============================================
// Input Types
// ============================================

/**
 * Input to the build pipeline
 * Extension sends this to Core for processing
 */
export interface ComponentInput {
	/** Unique identifier for the component */
	id: string;

	/** Where the component came from */
	source: ComponentSource;

	/** Framework (auto-detected if not provided) */
	framework?: Framework;

	/** Source files: { filename: content } */
	files: { [filename: string]: string };

	/** Entry file (auto-detected if not provided) */
	entryFile?: string;

	/** Job priority (default: 'normal') */
	priority?: JobPriority;

	/** Package versions from AI: { "react": "19.0.0" } */
	dependencies?: Record<string, string>;
}

// ============================================
// Output Types
// ============================================

/**
 * Output from the build pipeline
 * Core returns this after successful build
 */
export interface TransformedComponent {
	/** Component ID (matches input) */
	id: string;

	/** Detected/specified framework */
	framework: Framework;

	/** Bundled ESM code ready for execution */
	bundledCode: string;

	/** CDN URLs used in the bundle */
	cdnUrls: string[];

	/** Build metadata */
	metadata: {
		/** Bundle size in bytes */
		size: number;
		/** Build time in milliseconds */
		transformTime: number;
	};
}

// ============================================
// Job Types
// ============================================

/**
 * Represents a build job in the queue
 */
export interface SandboxJob {
	/** Job ID (same as component ID) */
	id: string;

	/** Original input */
	input: ComponentInput;

	/** Current status */
	status: JobStatus;

	/** Result if completed */
	result?: TransformedComponent;

	/** Error message if failed */
	error?: string;

	/** When job was created (timestamp) */
	createdAt: number;

	/** When job completed (timestamp) */
	completedAt?: number;
}

// ============================================
// Queue Status Types
// ============================================

/**
 * Queue statistics
 */
export interface QueueStatus {
	queued: number;
	processing: number;
	completed: number;
	failed: number;
}

// ============================================
// Validation Types
// ============================================

/**
 * Result of component validation
 */
export interface ValidationResult {
	valid: boolean;
	errors: string[];
	warnings?: string[];
}
