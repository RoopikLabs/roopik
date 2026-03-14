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
 * Multi-tab architecture:
 *   - Agents reference tabs by stable `tabId` (auto-incrementing integer)
 *   - Internally, each backend maps tabId → actual browserViewId/CDPSession
 *   - tabId survives view recreation (e.g., drag between editor groups)
 *   - Tools pass optional tabId; omit = active tab
 *
 * Usage:
 *   const backend = getBrowserBackend();
 *   const tabId = await backend.openNewTab('https://example.com');
 *   const browserViewId = backend.resolveTabId(tabId);
 *   await backend.navigate(browserViewId, url);
 */

import type { NavigationState, NavigationStateChangedEvent, DevToolsClosedEvent } from '../../common/projectMode/types.js';
import type { GetElementStylesRequest, GetElementStylesResult } from '../../common/cssResolvers/types.js';
import type { Event } from '../../../../../base/common/event.js';

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of browser tabs allowed in embedded mode. External mode has no limit. */
export const MAX_BROWSER_TABS = 3;

// ============================================================================
// Tab Info — returned by listTabs()
// ============================================================================

export interface TabInfo {
	tabId: number;
	url: string;
	title: string;
	isActive: boolean;
}

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

	// ------ Tab Management (multi-tab) ------

	/** Open a new tab. Returns the stable tabId. Respects MAX_BROWSER_TABS in embedded mode. */
	openNewTab(url?: string): Promise<number>;

	/** List all open tabs with their info */
	listTabs(): TabInfo[];

	/** Get the active tab's stable ID. undefined = no tabs open. */
	getActiveTabId(): number | undefined;

	/** Switch active tab. In embedded mode, shows/hides views. */
	setActiveTab(tabId: number): Promise<void>;

	/** Close a specific tab by tabId */
	closeTab(tabId: number): Promise<void>;

	/** Resolve stable tabId to internal browserViewId. Throws if not found. */
	resolveTabId(tabId: number): number;

	// ------ Lifecycle (legacy — used internally) ------

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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	executeScript(browserViewId: number, script: string): Promise<any>;

	// ------ CSS Inspection (source-map resolution) ------
	getElementStyles(request: GetElementStylesRequest): Promise<GetElementStylesResult>;

	// ------ CDP (low-level) ------
	attachDebugger(browserViewId: number): Promise<void>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	sendCDPCommand(browserViewId: number, method: string, params?: any): Promise<any>;

	// ------ Viewport ------
	getViewportSize(browserViewId: number): { width: number; height: number } | null;

	// ------ CDP Event Listener ------
	/** Register a callback for CDP events on a browser view. Returns cleanup function. */
	onCDPEvent(browserViewId: number, callback: (method: string, params: unknown) => void): () => void;

	// ------ Events ------
	readonly onBrowserViewCreated: Event<{ browserViewId: number }>;
	readonly onBrowserViewDestroyed: Event<{ browserViewId: number }>;
	readonly onNavigationStateChanged: Event<NavigationStateChangedEvent>;
	readonly onDevToolsClosed: Event<DevToolsClosedEvent>;

	// ------ Tab Events (multi-tab) ------
	readonly onTabCreated: Event<{ tabId: number; url?: string }>;
	readonly onTabClosed: Event<{ tabId: number }>;
	readonly onActiveTabChanged: Event<{ tabId: number }>;
}
