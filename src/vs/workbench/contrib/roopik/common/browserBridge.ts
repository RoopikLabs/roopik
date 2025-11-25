/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Browser Bridge
 *
 * Clean communication interface between browser process (UI) and main process (BrowserView).
 * All browser-related IPC messages pass through this bridge.
 */

/**
 * Browser navigation commands (Browser → Main)
 */
export interface IBrowserNavigationCommand {
	type: 'navigate' | 'back' | 'forward' | 'reload' | 'stop';
	containerId: string;
	url?: string; // Required for 'navigate'
}

/**
 * Browser DevTools commands (Browser → Main)
 */
export interface IBrowserDevToolsCommand {
	type: 'openDevTools' | 'closeDevTools';
	containerId: string;
}

/**
 * Browser screenshot command (Browser → Main)
 */
export interface IBrowserScreenshotCommand {
	type: 'takeScreenshot';
	containerId: string;
	options?: {
		format?: 'png' | 'jpeg';
		quality?: number; // 0-100 for jpeg
	};
}

/**
 * Browser inspect command (Browser → Main)
 */
export interface IBrowserInspectCommand {
	type: 'enableInspect' | 'disableInspect';
	containerId: string;
}

/**
 * Browser state events (Main → Browser)
 */
export interface IBrowserStateEvent {
	type: 'urlChanged' | 'loadingStarted' | 'loadingStopped' | 'titleChanged';
	containerId: string;
	url?: string;
	title?: string;
	progress?: number; // 0-100
}

/**
 * Browser error events (Main → Browser)
 */
export interface IBrowserErrorEvent {
	type: 'navigationError' | 'loadError';
	containerId: string;
	error: string;
	code?: number;
}

/**
 * Browser bounds update command (Browser → Main)
 */
export interface IBrowserBoundsCommand {
	type: 'updateBounds';
	containerId: string;
	bounds: {
		x: number;
		y: number;
		width: number;
		height: number;
	};
}

/**
 * Union type for all browser commands (Browser → Main)
 */
export type BrowserCommand =
	| IBrowserNavigationCommand
	| IBrowserDevToolsCommand
	| IBrowserScreenshotCommand
	| IBrowserInspectCommand
	| IBrowserBoundsCommand;

/**
 * Union type for all browser events (Main → Browser)
 */
export type BrowserEvent =
	| IBrowserStateEvent
	| IBrowserErrorEvent;

/**
 * IPC Channel Names
 */
export const BrowserBridgeChannels = {
	// Browser → Main
	COMMAND: 'roopik:browser:command',

	// Main → Browser
	EVENT: 'roopik:browser:event',
} as const;
