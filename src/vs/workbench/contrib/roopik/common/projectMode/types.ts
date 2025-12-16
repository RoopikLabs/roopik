/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Device preset for viewport emulation
 */
export interface DevicePreset {
	name: string;
	width: number;
	height: number;
	deviceScaleFactor: number;
	mobile: boolean;
	userAgent?: string;
}

/**
 * Browser view bounds
 */
export interface ViewBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Navigation error info
 */
export interface NavigationError {
	errorCode: number;
	errorDescription: string;
	validatedURL: string;
}

/**
 * Browser navigation state
 */
export interface NavigationState {
	canGoBack: boolean;
	canGoForward: boolean;
	url: string;
	title: string;
	isLoading: boolean;
	/** Last navigation error (cleared on successful navigation) */
	lastError?: NavigationError;
}

/**
 * CDP domain enable options
 */
export interface CDPDomains {
	network?: boolean;
	dom?: boolean;
	css?: boolean;
	runtime?: boolean;
	performance?: boolean;
	page?: boolean;
}

/**
 * Console message from browser
 */
export interface ConsoleMessage {
	type: 'log' | 'warn' | 'error' | 'info' | 'debug';
	text: string;
	timestamp: number;
	source?: string;
	lineNumber?: number;
}

/**
 * Network request info
 */
export interface NetworkRequest {
	requestId: string;
	url: string;
	method: string;
	status?: number;
	statusText?: string;
	mimeType?: string;
	timestamp: number;
}

/**
 * Browser view creation result
 */
export interface BrowserViewResult {
	browserViewId: number;
	debuggingPort: number;
}

/**
 * DevTools view creation result
 */
export interface DevToolsViewResult {
	devtoolsViewId: number;
}

/**
 * DevTools open options
 *
 * DevTools is always opened in 'attached' mode (docked inside browser window).
 * This gives access to Device Toolbar toggle and close button.
 * Users can detach DevTools manually from DevTools settings if needed.
 */
export interface DevToolsOptions {
	// Currently no options needed - DevTools always opens in attached mode
	// This interface is kept for future extensibility (e.g., initial panel selection)
}

/**
 * Event payload when DevTools is closed
 * Fired when user closes DevTools via built-in X button
 */
export interface DevToolsClosedEvent {
	browserViewId: number;
}

/**
 * Event payload when navigation state changes
 * Fired on: did-navigate, did-start-loading, did-finish-load, page-title-updated, page-favicon-updated
 * This replaces polling for URL/title/loading state updates
 */
export interface NavigationStateChangedEvent {
	browserViewId: number;
	url: string;
	title: string;
	isLoading: boolean;
	canGoBack: boolean;
	canGoForward: boolean;
	/** Navigation error if any (cleared on successful navigation) */
	lastError?: NavigationError;
	/** Favicon URL (first from page-favicon-updated event) */
	favicon?: string;
}

/**
 * Event payload when user requests to open source from context menu
 * Fired when user clicks "Open Source" in browser context menu
 */
export interface OpenSourceRequestEvent {
	browserViewId: number;
	/** Source location from data-roopik-source attribute */
	sourceLocation: {
		file: string;
		line: number;
		column?: number;
		endLine?: number;
		endColumn?: number;
	} | null;
	/** Error message if source location could not be determined */
	error?: string;
}

// ============================================
// Browser Bridge Messages (CDP Runtime.bindingCalled)
// ============================================

/**
 * Base interface for all browser bridge messages
 * Sent from injected scripts via window.__roopikBridge()
 */
export interface BrowserBridgeMessageBase {
	type: string;
	browserViewId?: number; // Added by main process
}

/**
 * Element selected in inspect mode
 */
export interface ElementSelectedMessage extends BrowserBridgeMessageBase {
	type: 'element-selected';
	selector: string;
	html: string;
	tagName: string;
	source: {
		file: string;
		line: number;
		column?: number;
		endLine?: number;
		endColumn?: number;
	} | null;
	bounds: {
		x: number;
		y: number;
		width: number;
		height: number;
	};
}

/**
 * Inspect mode exited (ESC pressed)
 */
export interface InspectModeExitedMessage extends BrowserBridgeMessageBase {
	type: 'inspect-mode-exited';
}

/**
 * Union of all browser bridge message types
 * Add new message types here as we add features
 */
export type BrowserBridgeMessage =
	| ElementSelectedMessage
	| InspectModeExitedMessage;

/**
 * Event payload for browser bridge messages
 * Wraps the message with browserViewId
 */
export interface BrowserBridgeEvent {
	browserViewId: number;
	message: BrowserBridgeMessage;
}


