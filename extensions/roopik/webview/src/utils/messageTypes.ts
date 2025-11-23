/**
 * Type-safe message contracts for iframe ↔ webview ↔ extension communication
 *
 * This file defines all message types used in the preview system.
 * Messages flow: Iframe → Webview → Extension
 */

// ============================================================================
// Messages FROM iframe TO webview (prefixed with 'roopik-')
// ============================================================================

export interface IframeLogMessage {
	type: 'roopik-log';
	level: 'log' | 'warn' | 'error';
	args: any[];
}

export interface IframeClickToSourceMessage {
	type: 'roopik-click-to-source';
	file: string;
	line: number;
	column: number;
	endLine?: number;
	endColumn?: number;
	componentName?: string;
	parentContext?: string;
}

export interface IframeTitleChangeMessage {
	type: 'roopik-title-change';
	title: string;
}

export interface IframeNavigateMessage {
	type: 'roopik-navigate';
	url: string;
}

export interface IframeBrowserShortcutBlockedMessage {
	type: 'roopik-browser-shortcut-blocked';
	reason: string;
	detail?: string;
}

export interface IframeInspectElementMessage {
	type: 'roopik-inspect-element';
	element: any;
}

export type IframeToWebviewMessage =
	| IframeLogMessage
	| IframeClickToSourceMessage
	| IframeTitleChangeMessage
	| IframeNavigateMessage
	| IframeBrowserShortcutBlockedMessage
	| IframeInspectElementMessage;

// ============================================================================
// Messages FROM webview TO iframe
// ============================================================================

export interface WebviewToIframeDebugMessage {
	type: 'roopik-toggle-debug';
	enabled: boolean;
}

export interface WebviewToIframeInspectMessage {
	type: 'roopik-toggle-inspect';
	enabled: boolean;
}

export interface WebviewToIframeHandshakeMessage {
	type: 'ROOPIK_HANDSHAKE_SYN';
	secret: string;
}

export interface WebviewToIframeInitUrlMessage {
	type: 'roopik-init-url';
	url: string;
}

export type WebviewToIframeMessage =
	| WebviewToIframeDebugMessage
	| WebviewToIframeInspectMessage
	| WebviewToIframeHandshakeMessage
	| WebviewToIframeInitUrlMessage;

// ============================================================================
// Messages FROM webview TO extension (via vscode.postMessage)
// ============================================================================

export interface WebviewToExtensionIframeLogMessage {
	type: 'iframe-log';
	level: 'log' | 'warn' | 'error';
	args: any[];
}

export interface WebviewToExtensionClickToSourceMessage {
	type: 'click-to-source';
	file: string;
	line: number;
	column: number;
	endLine?: number;
	endColumn?: number;
	componentName?: string;
	parentContext?: string;
}

export interface WebviewToExtensionToggleHighlightMessage {
	type: 'toggle-highlight-mode';
	enabled: boolean;
}

export interface WebviewToExtensionNavigateMessage {
	type: 'navigate';
	url: string;
}

export interface WebviewToExtensionUpdateTitleMessage {
	type: 'update-title';
	title: string;
}

export interface WebviewToExtensionStopServerMessage {
	type: 'stop-server';
}

export type WebviewToExtensionMessage =
	| WebviewToExtensionIframeLogMessage
	| WebviewToExtensionClickToSourceMessage
	| WebviewToExtensionToggleHighlightMessage
	| WebviewToExtensionNavigateMessage
	| WebviewToExtensionUpdateTitleMessage
	| WebviewToExtensionStopServerMessage;

// ============================================================================
// Type guards
// ============================================================================

export function isIframeToWebviewMessage(message: any): message is IframeToWebviewMessage {
	return message && typeof message.type === 'string' && message.type.startsWith('roopik-');
}

export function isWebviewToIframeMessage(message: any): message is WebviewToIframeMessage {
	return message && typeof message.type === 'string' &&
		(message.type.startsWith('roopik-') || message.type === 'ROOPIK_HANDSHAKE_SYN');
}

export function isWebviewToExtensionMessage(message: any): message is WebviewToExtensionMessage {
	return message && typeof message.type === 'string' &&
		['iframe-log', 'click-to-source', 'toggle-highlight-mode', 'navigate', 'update-title', 'stop-server'].includes(message.type);
}

