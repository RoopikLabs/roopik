/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { Component, BuildResult } from '../component/types.js';

// ============================================================================
// Service Interface
// ============================================================================

export const IBuildService = createDecorator<IBuildService>('roopikBuildService');

/**
 * Build Service Interface
 *
 * Handles building components using ESBuild.
 * Reads source from workspace, writes bundle to cache.
 */
export interface IBuildService {
	readonly _serviceBrand: undefined;

	/**
	 * Build a component
	 *
	 * Flow:
	 * 1. Read source files from workspace
	 * 2. Bundle with ESBuild
	 * 3. Inject scripts (inspect, error boundary)
	 * 4. Write to cache
	 * 5. Return result
	 */
	build(component: Component): Promise<BuildResult>;

	/**
	 * Check if cached build is valid
	 */
	isCacheValid(componentId: string, canvasId: string, sourceHash: string): Promise<boolean>;

	/**
	 * Invalidate cache for a component
	 */
	invalidateCache(componentId: string, canvasId: string): Promise<void>;
}
