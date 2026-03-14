/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Browser Backend Interface
 *
 * Abstraction layer between browser tools and the actual browser implementation.
 * Both embedded (WebContentsView) and external (Chrome via CDP) backends implement this.
 *
 * The tools layer (BrowserToolService, RoopikToolsChannel) calls this interface —
 * it never knows whether the browser is embedded or external.
 *
 * Usage:
 *   const backend = getBrowserBackend(); // returns active backend based on settings
 *   const id = backend.getActiveBrowserViewId();
 *   await backend.navigate(id, url);
 */

import type { NavigationState } from '../../common/projectMode/types.js';
import type { GetElementStylesRequest, GetElementStylesResult } from '../../common/cssResolvers/types.js';
import type { Event } from '../../../../../base/common/event.js';
import type { NavigationStateChangedEvent, DevToolsClosedEvent } from '../../common/projectMode/types.js';

// ============================================================================
// Screenshot metadata returned by both backends
// ============================================================================
export interface ScreenshotWithMetadata {
	image: string; // data URL
	width: number;
	height: number;
	devicePixelRatio: number;
}

// ============================================================================
// Browser Backend Interface
// ============================================================================
export interface IBrowserBackend {

	// ------ Lifecycle ------
	/** Get the active browser view/page ID. undefined = no browser open. */
	getActiveBrowserViewId(): number | undefined;

	/** Request the browser to open (may be async — fires event for renderer in embedded mode) */
	requestBrowserOpen(url?: string): void;

	/** Request the browser to close */
	requestBrowserClose(): void;

	// ------ Navigation ------
	navigate(browserViewId: number, url: string): Promise<void>;
	reload(browserViewId: number, ignoreCache?: boolean): Promise<void>;
	getNavigationState(browserViewId: number): Promise<NavigationState>;

	// ------ Screenshot ------
	takeScreenshotWithMetadata(browserViewId: number): Promise<ScreenshotWithMetadata>;

	// ------ Input ------
	sendMouseEvent(browserViewId: number, action: string, x: number, y: number): Promise<void>;
	sendTypeEvent(browserViewId: number, text: string): Promise<void>;
	sendKeyEvent(browserViewId: number, key: string, modifiers?: string[]): Promise<void>;
	sendScrollEvent(browserViewId: number, deltaX: number, deltaY: number, x?: number, y?: number): Promise<void>;

	// ------ Script Execution ------
	executeScript(browserViewId: number, script: string): Promise<unknown>;

	// ------ CSS Inspection (source-map resolution) ------
	getElementStyles(request: GetElementStylesRequest): Promise<{
		success: boolean;
		data?: GetElementStylesResult;
		error?: string;
	}>;

	// ------ CDP (low-level) ------
	attachDebugger(browserViewId: number): Promise<void>;
	sendCDPCommand(browserViewId: number, method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;

	// ------ Viewport ------
	getViewportSize(browserViewId: number): { width: number; height: number } | undefined;

	// ------ CDP Event Listener ------
	/** Register a callback for CDP events on a browser view. Returns cleanup function. */
	onCDPEvent(browserViewId: number, callback: (method: string, params: unknown) => void): () => void;

	// ------ Events ------
	readonly onBrowserViewCreated: Event<{ browserViewId: number }>;
	readonly onBrowserViewDestroyed: Event<{ browserViewId: number }>;
	readonly onNavigationStateChanged: Event<NavigationStateChangedEvent>;
	readonly onDevToolsClosed: Event<DevToolsClosedEvent>;
}
