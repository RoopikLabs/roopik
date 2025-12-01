/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Sandbox Pipeline Module
 *
 * ESBuild-based component transformation pipeline.
 *
 * Main exports:
 * - SandboxPipelineService: Main API for processing components
 * - Types: All TypeScript interfaces and types
 */

// Main service
export { SandboxPipelineService } from './sandboxPipelineService.js';

// Sub-services (for advanced usage)
export { ComponentParser } from './componentParser.js';
export { CodeTransformer } from './codeTransformer.js';
export { SandboxQueue } from './sandboxQueue.js';

// Types
export type {
	Framework,
	ComponentSource,
	JobStatus,
	JobPriority,
	ComponentInput,
	TransformedComponent,
	SandboxJob,
	QueueStatus,
	ValidationResult,
	FrameworkConfig,
	FrameworkConfigMap
} from './types.js';
