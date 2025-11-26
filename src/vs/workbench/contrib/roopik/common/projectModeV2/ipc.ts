/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import type { ViewBounds, DevicePreset, BrowserViewResult, DevToolsViewResult, NavigationState, CDPDomains, DevToolsOptions, DevToolsClosedEvent, NavigationStateChangedEvent, BrowserInstanceInfo, BrowserListChangedEvent } from './types.js';

export const IProjectModeV2Service = createDecorator<IProjectModeV2Service>('projectModeV2Service');

/**
 * IPC Channel name for ProjectModeV2
 */
export const PROJECT_MODE_V2_CHANNEL = 'roopikProjectModeV2';

/**
 * ProjectModeV2 Service Interface
 *
 * Manages WebContentsView lifecycle with proper cleanup,
 * ON-DEMAND DevTools creation, and CDP integration.
 */
export interface IProjectModeV2Service {
	readonly _serviceBrand: undefined;

	// ============================================
	// Events
	// ============================================

	/**
	 * Fired when DevTools is closed externally (via built-in X button)
	 * Allows renderer to sync its state without polling
	 */
	readonly onDevToolsClosed: Event<DevToolsClosedEvent>;

	/**
	 * Fired when navigation state changes (URL, title, loading, back/forward)
	 * Replaces polling for navigation state updates - much more efficient!
	 * Fires on: did-navigate, did-start-loading, did-finish-load, page-title-updated
	 */
	readonly onNavigationStateChanged: Event<NavigationStateChangedEvent>;

	/**
	 * Fired when browser list changes (create, destroy)
	 * Used for multi-browser management UI (welcome screen, browser selector)
	 */
	readonly onBrowserListChanged: Event<BrowserListChangedEvent>;

	// ============================================
	// Browser View Lifecycle
	// ============================================

	/**
	 * Create a new browser WebContentsView
	 * @param windowId - The parent window ID
	 * @returns Browser view ID and debugging port
	 */
	createBrowserView(windowId: number): Promise<BrowserViewResult>;

	/**
	 * Destroy browser view and cleanup resources
	 * CRITICAL: Must properly destroy to avoid ghost process
	 */
	destroyBrowserView(browserViewId: number): Promise<void>;

	/**
	 * Set browser view bounds
	 */
	setBrowserBounds(browserViewId: number, bounds: ViewBounds): Promise<void>;

	/**
	 * Set browser view visibility
	 */
	setBrowserVisible(browserViewId: number, visible: boolean): Promise<void>;

	// ============================================
	// Browser Instance Management
	// ============================================

	/**
	 * Get list of all active browser instances
	 * Used for welcome screen browser selector
	 */
	getBrowserList(): Promise<BrowserInstanceInfo[]>;

	/**
	 * Get current browser count
	 */
	getBrowserCount(): Promise<number>;

	/**
	 * Get maximum allowed browser count
	 */
	getMaxBrowserCount(): Promise<number>;

	/**
	 * Check if can create a new browser (under max limit)
	 */
	canCreateBrowser(): Promise<boolean>;

	// ============================================
	// Navigation
	// ============================================

	/**
	 * Navigate to URL
	 */
	navigate(browserViewId: number, url: string): Promise<void>;

	/**
	 * Go back in history
	 */
	goBack(browserViewId: number): Promise<void>;

	/**
	 * Go forward in history
	 */
	goForward(browserViewId: number): Promise<void>;

	/**
	 * Reload page
	 */
	reload(browserViewId: number, ignoreCache?: boolean): Promise<void>;

	/**
	 * Stop loading
	 */
	stop(browserViewId: number): Promise<void>;

	/**
	 * Get current navigation state
	 */
	getNavigationState(browserViewId: number): Promise<NavigationState>;

	// ============================================
	// DevTools (ON-DEMAND creation)
	// ============================================

	/**
	 * Open DevTools
	 *
	 * Supports two modes:
	 * - 'attached': DevTools docked inside browser window (has Device Toolbar, close button)
	 * - 'detached': DevTools in separate WebContentsView (full layout control, no Device Toolbar)
	 *
	 * @param browserViewId - The browser view to attach DevTools to
	 * @param options - DevTools configuration (mode and bounds for detached mode)
	 */
	openDevTools(browserViewId: number, options: DevToolsOptions): Promise<DevToolsViewResult>;

	/**
	 * Close and destroy DevTools view
	 */
	closeDevTools(browserViewId: number): Promise<void>;

	/**
	 * Set DevTools view bounds
	 */
	setDevToolsBounds(browserViewId: number, bounds: ViewBounds): Promise<void>;

	/**
	 * Check if DevTools is open
	 */
	isDevToolsOpen(browserViewId: number): Promise<boolean>;

	// ============================================
	// CDP (Chrome DevTools Protocol)
	// ============================================

	/**
	 * Attach CDP debugger to browser view
	 */
	attachDebugger(browserViewId: number, protocolVersion?: string): Promise<void>;

	/**
	 * Detach CDP debugger
	 */
	detachDebugger(browserViewId: number): Promise<void>;

	/**
	 * Enable CDP domains
	 */
	enableCDPDomains(browserViewId: number, domains: CDPDomains): Promise<void>;

	/**
	 * Send CDP command
	 */
	sendCDPCommand(browserViewId: number, method: string, params?: any): Promise<any>;

	// ============================================
	// Device Emulation (via CDP)
	// ============================================

	/**
	 * Set device emulation
	 */
	setDeviceEmulation(browserViewId: number, device: DevicePreset): Promise<void>;

	/**
	 * Clear device emulation
	 */
	clearDeviceEmulation(browserViewId: number): Promise<void>;

	// ============================================
	// Utilities
	// ============================================

	/**
	 * Take screenshot
	 */
	takeScreenshot(browserViewId: number): Promise<string>;

	/**
	 * Execute JavaScript in browser
	 */
	executeScript(browserViewId: number, script: string): Promise<any>;

	/**
	 * Get page HTML
	 */
	getPageHTML(browserViewId: number): Promise<string>;

	/**
	 * Get debugging WebSocket URL for MCP connection
	 */
	getDebuggingUrl(browserViewId: number): Promise<string>;

	// ============================================
	// Overlay View (for floating toolbar, menus)
	// CRITICAL: Creates WebContentsView that renders ON TOP of browser
	// ============================================

	/**
	 * Create overlay view for floating UI elements (toolbar, menus)
	 * This creates a transparent WebContentsView positioned above the browser
	 * @param browserViewId - Parent browser view ID
	 * @param bounds - Position and size of overlay
	 * @param htmlContent - HTML content to render in overlay
	 * @returns Overlay view ID
	 */
	createOverlayView(browserViewId: number, bounds: ViewBounds, htmlContent: string): Promise<number>;

	/**
	 * Update overlay view bounds
	 */
	setOverlayBounds(overlayViewId: number, bounds: ViewBounds): Promise<void>;

	/**
	 * Update overlay HTML content
	 */
	setOverlayContent(overlayViewId: number, htmlContent: string): Promise<void>;

	/**
	 * Show/hide overlay view
	 */
	setOverlayVisible(overlayViewId: number, visible: boolean): Promise<void>;

	/**
	 * Destroy overlay view
	 */
	destroyOverlayView(overlayViewId: number): Promise<void>;
}
