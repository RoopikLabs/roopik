/**
 * Type-safe message contracts for extension ↔ webview communication
 *
 * This file defines message types received by the extension from the webview.
 * Messages flow: Webview → Extension
 */

// ============================================================================
// Messages FROM webview TO extension
// ============================================================================

export interface ExtensionIframeLogMessage {
	type: 'iframe-log';
	level: 'log' | 'warn' | 'error';
	args: any[];
}

export interface ExtensionClickToSourceMessage {
	type: 'click-to-source';
	file: string;
	line: number;
	column: number;
	endLine?: number;
	endColumn?: number;
	componentName?: string;
	parentContext?: string;
}

export interface ExtensionToggleHighlightMessage {
	type: 'toggle-highlight-mode';
	enabled: boolean;
}

export interface ExtensionNavigateMessage {
	type: 'navigate';
	url: string;
}

export interface ExtensionUpdateTitleMessage {
	type: 'update-title';
	title: string;
}

export interface ExtensionStopServerMessage {
	type: 'stop-server';
}

export type ExtensionMessage =
	| ExtensionIframeLogMessage
	| ExtensionClickToSourceMessage
	| ExtensionToggleHighlightMessage
	| ExtensionNavigateMessage
	| ExtensionUpdateTitleMessage
	| ExtensionStopServerMessage;

// ============================================================================
// Type guard
// ============================================================================

export function isExtensionMessage(message: any): message is ExtensionMessage {
	return message && typeof message.type === 'string' &&
		['iframe-log', 'click-to-source', 'toggle-highlight-mode', 'navigate', 'update-title', 'stop-server'].includes(message.type);
}

