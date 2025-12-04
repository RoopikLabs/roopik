/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// ============================================================
// Types
// ============================================================

export type {
	Sandbox,
	SandboxMessage,
	CanvasState,
	Transform,
	BackgroundPattern,
} from './types';

// ============================================================
// Components
// ============================================================

export {
	InfiniteCanvas,
	SandboxCard,
	SandboxPreview,
	StatusPanel,
	ColorPicker,
	FloatingToolbar,
	// Hooks
	useCanvasZoom,
	useCanvasDrag,
	getBackgroundStyle,
} from './components';

export type {
	InfiniteCanvasProps,
	SandboxCardProps,
	StatusPanelProps,
} from './components';

// ============================================================
// Services
// ============================================================

export {
	// Grid management
	type GridConfig,
	DEFAULT_CONFIG,
	getSandboxTotalDimensions,
	getGridPosition,
	reorganizeSandboxes,
	getSandboxBoundingBox,
	calculateFitAllTransform,
	calculateFocusTransform,
	createSandbox,
	bringToFront,
} from './services';
