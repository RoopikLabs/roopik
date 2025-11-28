/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
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
 * DevTools mode configuration
 *
 * - 'attached': DevTools is docked inside the BrowserWindow (bottom).
 *   This gives access to Device Toolbar toggle and close button.
 *   DevTools shares the browser window space.
 *
 * - 'detached': DevTools is rendered in a separate WebContentsView.
 *   We have full control over positioning and sizing.
 *   Device Toolbar toggle is NOT available in this mode.
 */
export type DevToolsMode = 'attached' | 'detached';

/**
 * DevTools open options
 */
export interface DevToolsOptions {
	/**
	 * Mode for DevTools rendering
	 * - 'attached': Docked inside browser window (has device toolbar, close button)
	 * - 'detached': Separate WebContentsView (full control over layout)
	 * @default 'attached'
	 */
	mode: DevToolsMode;

	/**
	 * Bounds for the DevTools view (only used in 'detached' mode)
	 * In 'attached' mode, Electron manages the DevTools position
	 */
	bounds?: ViewBounds;
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
 * Fired on: did-navigate, did-start-loading, did-finish-load, page-title-updated
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
}


