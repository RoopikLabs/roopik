/**
 * Message Bridge: Simplifies communication between iframe ↔ webview ↔ extension
 *
 * This bridge automatically forwards messages from iframe to extension,
 * transforming message types as needed. The webview becomes a transparent relay.
 */

import type {
	IframeToWebviewMessage,
	WebviewToIframeMessage,
	WebviewToExtensionMessage
} from './messageTypes';
import {
	isIframeToWebviewMessage
} from './messageTypes';

/**
 * VS Code API type (acquired via acquireVsCodeApi)
 */
export type VSCodeAPI = {
	postMessage: (message: any) => void;
	getState: () => any;
	setState: (state: any) => void;
};

/**
 * Message transformation: iframe message → extension message
 */
function transformIframeToExtension(
	iframeMessage: IframeToWebviewMessage
): WebviewToExtensionMessage | null {
	switch (iframeMessage.type) {
		case 'roopik-log':
			return {
				type: 'iframe-log',
				level: iframeMessage.level,
				args: iframeMessage.args
			};

		case 'roopik-click-to-source':
			return {
				type: 'click-to-source',
				file: iframeMessage.file,
				line: iframeMessage.line,
				column: iframeMessage.column,
				endLine: iframeMessage.endLine,
				endColumn: iframeMessage.endColumn,
				componentName: iframeMessage.componentName,
				parentContext: iframeMessage.parentContext
			};

		case 'roopik-title-change':
			return {
				type: 'update-title',
				title: iframeMessage.title
			};

		case 'roopik-navigate':
			return {
				type: 'navigate',
				url: iframeMessage.url
			};

		// These messages are handled locally in webview, not forwarded
		case 'roopik-browser-shortcut-blocked':
		case 'roopik-inspect-element':
			return null;

		default:
			return null;
	}
}

/**
 * Setup message bridge: automatically forwards iframe messages to extension
 *
 * @param vscode - VS Code API instance
 * @param onLocalMessage - Optional callback for messages handled locally (not forwarded)
 */
export function setupMessageBridge(
	vscode: VSCodeAPI,
	onLocalMessage?: (message: IframeToWebviewMessage) => void
): () => void {
	const handleMessage = (event: MessageEvent) => {
		const message = event.data;

		// Only handle messages from iframe (prefixed with 'roopik-')
		if (!isIframeToWebviewMessage(message)) {
			return;
		}

		// Transform and forward to extension
		const extensionMessage = transformIframeToExtension(message);
		if (extensionMessage) {
			vscode.postMessage(extensionMessage);
		}

		// Call local handler for messages that need webview-side handling
		if (onLocalMessage) {
			onLocalMessage(message);
		}
	};

	window.addEventListener('message', handleMessage);

	// Return cleanup function
	return () => {
		window.removeEventListener('message', handleMessage);
	};
}

/**
 * Send message to iframe
 *
 * @param iframe - The iframe element reference
 * @param message - Message to send
 */
export function sendToIframe(
	iframe: HTMLIFrameElement | null,
	message: WebviewToIframeMessage
): void {
	if (!iframe || !iframe.contentWindow) {
		console.warn('[MessageBridge] Cannot send message - iframe not ready');
		return;
	}

	try {
		iframe.contentWindow.postMessage(message, '*');
	} catch (error) {
		console.error('[MessageBridge] Failed to send message to iframe:', error);
	}
}

/**
 * Send message to extension
 *
 * @param vscode - VS Code API instance
 * @param message - Message to send
 */
export function sendToExtension(
	vscode: VSCodeAPI,
	message: WebviewToExtensionMessage
): void {
	vscode.postMessage(message);
}

