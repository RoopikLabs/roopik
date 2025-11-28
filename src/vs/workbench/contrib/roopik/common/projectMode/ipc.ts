/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import type { ViewBounds, DevicePreset, BrowserViewResult, DevToolsViewResult, NavigationState, CDPDomains, DevToolsOptions, DevToolsClosedEvent, NavigationStateChangedEvent } from './types.js';

export const IProjectModeService = createDecorator<IProjectModeService>('projectModeService');

/**
 * IPC Channel name for ProjectMode
 */
export const PROJECT_MODE_CHANNEL = 'roopikProjectMode';

/**
 * ProjectMode Service Interface
 *
 * Manages WebContentsView lifecycle with proper cleanup,
 * ON-DEMAND DevTools creation, and CDP integration.
 */
export interface IProjectModeService {
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
	// DevTools (Attached Mode)
	// ============================================

	/**
	 * Open DevTools (docked at bottom of browser window)
	 *
	 * DevTools opens in attached mode with Device Toolbar and close button available.
	 * Users can detach from DevTools settings menu if they want a separate window.
	 *
	 * @param browserViewId - The browser view to attach DevTools to
	 * @param options - DevTools configuration (reserved for future options)
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

	/**
	 * Execute JavaScript in overlay view
	 * Used for getting/setting state in floating toolbar
	 */
	executeScriptOnOverlay(overlayViewId: number, script: string): Promise<any>;
}
