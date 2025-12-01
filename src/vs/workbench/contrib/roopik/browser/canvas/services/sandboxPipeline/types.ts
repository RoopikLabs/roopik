/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Sandbox Pipeline Types
 *
 * Core type definitions for the ESBuild-based sandbox pipeline.
 * This pipeline transforms components from any source (AI, user, upload)
 * into executable code for rendering in isolated iframes.
 */

// ============================================
// Framework Types
// ============================================

/**
 * Supported UI frameworks
 */
export type Framework = 'react' | 'vue' | 'svelte' | 'html';

/**
 * Source of the component
 */
export type ComponentSource = 'ai' | 'user' | 'upload' | 'import';

/**
 * Job processing status
 */
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

/**
 * Job priority level
 */
export type JobPriority = 'high' | 'normal' | 'low';

// ============================================
// Input Types
// ============================================

/**
 * Input for component processing
 *
 * This is the main input type for the pipeline. It can come from:
 * - AI agents generating code
 * - Users uploading existing components
 * - Users writing code in the IDE
 * - Imports from Git/Figma
 */
export interface ComponentInput {
	/**
	 * Unique component ID
	 */
	id: string;

	/**
	 * Source of the component
	 */
	source: ComponentSource;

	/**
	 * Framework to use (optional, will be auto-detected if not provided)
	 */
	framework?: Framework;

	/**
	 * Map of filename to code content
	 *
	 * Examples:
	 * - Single file: Map([['Button.jsx', code]])
	 * - Multi-file: Map([['Header.vue', code], ['Header.css', css]])
	 */
	files: Map<string, string>;

	/**
	 * Main entry file (optional, will be auto-detected if not provided)
	 *
	 * Examples:
	 * - 'Button.jsx'
	 * - 'Header.vue'
	 * - 'index.html'
	 */
	entryFile?: string;

	/**
	 * Job priority (optional, default: 'normal')
	 */
	priority?: JobPriority;
}

// ============================================
// Output Types
// ============================================

/**
 * Transformed component ready for rendering
 *
 * This is the output of the transformation pipeline.
 * The bundledCode is ready to be executed in an iframe.
 */
export interface TransformedComponent {
	/**
	 * Component ID (matches input ID)
	 */
	id: string;

	/**
	 * Detected or specified framework
	 */
	framework: Framework;

	/**
	 * Bundled, transformed code ready to execute
	 *
	 * This code:
	 * - Has JSX transformed to React.createElement
	 * - Has bare imports replaced with CDN URLs
	 * - Is bundled if multi-file
	 * - Is in ESM format
	 */
	bundledCode: string;

	/**
	 * CDN URLs to load before executing code
	 *
	 * Examples:
	 * - ['https://esm.sh/react@18.2.0']
	 * - ['https://esm.sh/vue@3.3.4']
	 */
	cdnUrls: string[];

	/**
	 * Transformation metadata
	 */
	metadata: {
		/**
		 * Size of bundled code in bytes
		 */
		size: number;

		/**
		 * Time taken to transform in milliseconds
		 */
		transformTime: number;
	};
}

// ============================================
// Job Types
// ============================================

/**
 * A job in the processing queue
 *
 * Represents a component transformation job with its current status.
 */
export interface SandboxJob {
	/**
	 * Unique job ID
	 */
	id: string;

	/**
	 * Input component data
	 */
	input: ComponentInput;

	/**
	 * Current job status
	 */
	status: JobStatus;

	/**
	 * Transformed result (available when status is 'completed')
	 */
	result?: TransformedComponent;

	/**
	 * Error message (available when status is 'failed')
	 */
	error?: string;

	/**
	 * When the job was created
	 */
	createdAt: Date;

	/**
	 * When the job completed (success or failure)
	 */
	completedAt?: Date;
}

// ============================================
// Queue Status Types
// ============================================

/**
 * Current queue statistics
 */
export interface QueueStatus {
	/**
	 * Number of jobs waiting to be processed
	 */
	queued: number;

	/**
	 * Number of jobs currently being processed
	 */
	processing: number;

	/**
	 * Number of jobs that completed successfully
	 */
	completed: number;

	/**
	 * Number of jobs that failed
	 */
	failed: number;
}

// ============================================
// Validation Types
// ============================================

/**
 * Result of component validation
 */
export interface ValidationResult {
	/**
	 * Whether the component is valid
	 */
	valid: boolean;

	/**
	 * List of validation errors (empty if valid)
	 */
	errors: string[];

	/**
	 * List of validation warnings (non-blocking)
	 */
	warnings?: string[];
}

// ============================================
// Framework Configuration Types
// ============================================

/**
 * Framework-specific configuration
 */
export interface FrameworkConfig {
	/**
	 * File extensions for this framework
	 */
	extensions: string[];

	/**
	 * ESBuild loader to use
	 */
	loader: 'jsx' | 'tsx' | 'ts' | 'js';

	/**
	 * Default CDN URLs for this framework
	 */
	defaultCDNs: string[];

	/**
	 * Common entry file names
	 */
	entryFileNames: string[];
}

/**
 * Map of framework configurations
 */
export type FrameworkConfigMap = Record<Framework, FrameworkConfig>;
