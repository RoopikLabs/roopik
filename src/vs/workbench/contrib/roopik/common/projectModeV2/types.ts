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
 * Browser navigation state
 */
export interface NavigationState {
	canGoBack: boolean;
	canGoForward: boolean;
	url: string;
	title: string;
	isLoading: boolean;
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
