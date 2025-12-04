/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

export {
	// Types
	type GridConfig,
	// Constants
	DEFAULT_CONFIG,
	// Grid calculations
	getSandboxTotalDimensions,
	getGridPosition,
	reorganizeSandboxes,
	// Bounding box
	getSandboxBoundingBox,
	// Viewport calculations
	calculateFitAllTransform,
	calculateFocusTransform,
	// Sandbox management
	createSandbox,
	bringToFront,
} from './gridManager';
