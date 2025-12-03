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

import type { ComponentInput, TransformedComponent } from './pipeline';

// ============================================================================
// Messages FROM Webview TO Extension
// ============================================================================

export interface WebviewReadyMessage {
	type: 'ready';
}

/**
 * Request to build a component via Core's ESBuild pipeline
 */
export interface WebviewBuildComponentMessage {
	type: 'buildComponent';
	payload: {
		/** Unique ID to correlate request/response */
		componentId: string;
		/** ComponentInput for the pipeline */
		input: ComponentInput;
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
	| WebviewBuildComponentMessage
	| WebviewOpenFileMessage
	| WebviewLogMessage;

// ============================================================================
// Messages FROM Extension TO Webview
// ============================================================================

/**
 * Component built successfully
 */
export interface ExtensionComponentBuiltMessage {
	type: 'componentBuilt';
	payload: {
		/** Component ID (matches request) */
		componentId: string;
		/** Build result from Core */
		result: TransformedComponent;
	};
}

/**
 * Component build failed
 */
export interface ExtensionComponentErrorMessage {
	type: 'componentError';
	payload: {
		/** Component ID (matches request) */
		componentId: string;
		/** Error message */
		error: string;
	};
}

export interface ExtensionThemeChangedMessage {
	type: 'themeChanged';
	payload: {
		theme: 'light' | 'dark';
	};
}

export type ExtensionMessage =
	| ExtensionComponentBuiltMessage
	| ExtensionComponentErrorMessage
	| ExtensionThemeChangedMessage;

// ============================================================================
// Type Guards
// ============================================================================

export function isWebviewMessage(message: unknown): message is WebviewMessage {
	if (!message || typeof message !== 'object') return false;
	const msg = message as { type?: string };
	return typeof msg.type === 'string' && [
		'ready',
		'buildComponent',
		'openFile',
		'log'
	].includes(msg.type);
}

export function isExtensionMessage(message: unknown): message is ExtensionMessage {
	if (!message || typeof message !== 'object') return false;
	const msg = message as { type?: string };
	return typeof msg.type === 'string' && [
		'componentBuilt',
		'componentError',
		'themeChanged'
	].includes(msg.type);
}
