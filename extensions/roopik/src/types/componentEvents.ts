/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Component Event Types
 *
 * These types mirror the Core's component event types.
 * They are used for type-safe communication between Extension and Core.
 */

import type { Component, BuildResult, BuildErrorInfo } from './component';

/**
 * Event fired when a component is created
 */
export interface ComponentCreatedEvent {
	componentId: string;
	canvasId: string;
	component: Component;
}

/**
 * Event fired when a component build completes (success or failure)
 *
 * On success: `success=true`, `result` contains build metadata
 * On failure: `success=false`, `errorInfo` contains structured error details
 *
 * Note: `result.bundledCode` is NOT included in the event (too large).
 * Use `componentService.getBundledCode(id)` to get the actual code.
 */
export interface ComponentBuildEvent {
	componentId: string;
	canvasId: string;
	success: boolean;

	/** Build result (success case) - bundledCode omitted, use getBundledCode() */
	result?: Omit<BuildResult, 'bundledCode'>;

	/** Structured error info (failure case) */
	errorInfo?: BuildErrorInfo;

	/** Build triggered by: 'create' | 'update' | 'rebuild' | 'file-change' */
	trigger: 'create' | 'update' | 'rebuild' | 'file-change';
}

/**
 * Event fired when a component is deleted
 */
export interface ComponentDeletedEvent {
	componentId: string;
	canvasId: string;
}

/**
 * Event fired when component metadata changes
 */
export interface ComponentUpdatedEvent {
	componentId: string;
	canvasId: string;
	component: Component;
	changes: ('name' | 'source')[];
}
