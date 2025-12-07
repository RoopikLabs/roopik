/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// ============================================================
// Types
// ============================================================

export type {
	Sandbox,
	SandboxBuildStatus,
	CanvasState,
	Transform,
	BackgroundPattern,
	ComponentInput,
	DevicePreset,
	ExtensionMessage,
	WebviewMessage,
} from './types';

// ============================================================
// Components
// ============================================================

export {
	InfiniteCanvas,
	SandboxCard,
	StatusPanel,
	ColorPicker,
	DeviceToggle,
	DeviceSelector,
	DeviceIcon,
	GlobalDeviceToggle,
	// Hooks
	useCanvasZoom,
	useCanvasDrag,
	getBackgroundStyle,
} from './components';

export type {
	InfiniteCanvasProps,
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
	bringToFront,
} from './services';
