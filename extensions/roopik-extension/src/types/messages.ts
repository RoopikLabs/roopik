/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Type-safe message contracts for Extension ↔ Webview communication
 *
 * Messages flow in two directions:
 * - Webview → Extension (user actions, requests)
 * - Extension → Webview (responses, state updates)
 */

// ============================================================================
// Canvas State Types
// ============================================================================

export interface SandboxState {
	id: string;
	code: string;
	x: number;
	y: number;
	width: number;
	height: number;
	title?: string;
	isFullscreen?: boolean;
	deviceMode?: 'desktop' | 'tablet' | 'mobile';
}

export interface ViewportState {
	x: number;
	y: number;
	scale: number;
}

export interface CanvasState {
	sandboxes: SandboxState[];
	viewport: ViewportState;
}

export interface TransformOptions {
	framework?: 'react' | 'vue' | 'svelte';
	typescript?: boolean;
}

export interface TransformResult {
	html: string;
	css?: string;
	error?: string;
}

// ============================================================================
// Messages FROM Webview TO Extension
// ============================================================================

export interface WebviewReadyMessage {
	type: 'ready';
}

export interface WebviewTransformCodeMessage {
	type: 'transformCode';
	payload: {
		code: string;
		componentId: string;
		options?: TransformOptions;
	};
}

export interface WebviewSaveCanvasMessage {
	type: 'saveCanvas';
	payload: {
		canvasId: string;
		state: CanvasState;
	};
}

export interface WebviewLoadCanvasMessage {
	type: 'loadCanvas';
	payload: {
		canvasId: string;
	};
}

export interface WebviewOpenFileMessage {
	type: 'openFile';
	payload: {
		filePath: string;
		line?: number;
		column?: number;
	};
}

export interface WebviewLogMessage {
	type: 'log';
	payload: {
		level: 'info' | 'warn' | 'error' | 'debug';
		message: string;
		data?: unknown;
	};
}

export type WebviewMessage =
	| WebviewReadyMessage
	| WebviewTransformCodeMessage
	| WebviewSaveCanvasMessage
	| WebviewLoadCanvasMessage
	| WebviewOpenFileMessage
	| WebviewLogMessage;

// ============================================================================
// Messages FROM Extension TO Webview
// ============================================================================

export interface ExtensionTransformCompleteMessage {
	type: 'transformComplete';
	payload: {
		html: string;
		componentId: string;
	};
}

export interface ExtensionTransformErrorMessage {
	type: 'transformError';
	payload: {
		error: string;
		componentId: string;
	};
}

export interface ExtensionCanvasLoadedMessage {
	type: 'canvasLoaded';
	payload: {
		state: CanvasState;
	};
}

export interface ExtensionCanvasSavedMessage {
	type: 'canvasSaved';
	payload: {
		success: boolean;
	};
}

export interface ExtensionThemeChangedMessage {
	type: 'themeChanged';
	payload: {
		theme: 'light' | 'dark';
	};
}

export type ExtensionMessage =
	| ExtensionTransformCompleteMessage
	| ExtensionTransformErrorMessage
	| ExtensionCanvasLoadedMessage
	| ExtensionCanvasSavedMessage
	| ExtensionThemeChangedMessage;

// ============================================================================
// Type Guards
// ============================================================================

export function isWebviewMessage(message: unknown): message is WebviewMessage {
	if (!message || typeof message !== 'object') return false;
	const msg = message as { type?: string };
	return typeof msg.type === 'string' && [
		'ready',
		'transformCode',
		'saveCanvas',
		'loadCanvas',
		'openFile',
		'log'
	].includes(msg.type);
}

export function isExtensionMessage(message: unknown): message is ExtensionMessage {
	if (!message || typeof message !== 'object') return false;
	const msg = message as { type?: string };
	return typeof msg.type === 'string' && [
		'transformComplete',
		'transformError',
		'canvasLoaded',
		'canvasSaved',
		'themeChanged'
	].includes(msg.type);
}
