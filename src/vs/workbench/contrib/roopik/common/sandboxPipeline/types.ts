/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Sandbox Pipeline Types
 *
 * Shared types between browser and main process.
 * These types are used for IPC communication and service interfaces.
 */

// ============================================
// Framework Types
// ============================================

export type Framework = 'react' | 'vue' | 'svelte' | 'solid' | 'preact' | 'html';
export type ComponentSource = 'ai' | 'user' | 'upload' | 'import';
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type JobPriority = 'high' | 'normal' | 'low';

// ============================================
// Input Types
// ============================================

export interface ComponentInput {
	id: string;
	source: ComponentSource;
	framework?: Framework;
	files: { [filename: string]: string }; // Changed from Map for IPC serialization
	entryFile?: string;
	priority?: JobPriority;
	dependencies?: Record<string, string>; // AI-provided package versions (e.g., {"react": "19.0.0"})
}

// ============================================
// Output Types
// ============================================

export interface TransformedComponent {
	id: string;
	framework: Framework;
	bundledCode: string;
	cdnUrls: string[];
	metadata: {
		size: number;
		transformTime: number;
	};
}

// ============================================
// Job Types
// ============================================

export interface SandboxJob {
	id: string;
	input: ComponentInput;
	status: JobStatus;
	result?: TransformedComponent;
	error?: string;
	createdAt: number; // Changed to number for IPC serialization
	completedAt?: number;
}

// ============================================
// Queue Status Types
// ============================================

export interface QueueStatus {
	queued: number;
	processing: number;
	completed: number;
	failed: number;
}

// ============================================
// Validation Types
// ============================================

export interface ValidationResult {
	valid: boolean;
	errors: string[];
	warnings?: string[];
}

// ============================================
// Framework Configuration Types
// ============================================

export interface FrameworkConfig {
	extensions: string[];
	loader: 'jsx' | 'tsx' | 'ts' | 'js';
	entryFileNames: string[];
	// Note: defaultCDNs removed - CDN resolution is now handled dynamically
	// by ESBuildTransformer based on AI-provided dependencies
}

export type FrameworkConfigMap = Record<Framework, FrameworkConfig>;
