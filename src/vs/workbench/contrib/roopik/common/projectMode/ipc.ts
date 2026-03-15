/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import type { ViewBounds, BrowserViewResult, DevToolsViewResult, NavigationState, CDPDomains, DevToolsOptions, DevToolsClosedEvent, NavigationStateChangedEvent, OpenSourceRequestEvent, AttachElementRequestEvent, BrowserBridgeEvent, BrowserKeyEvent, McpBrowserOpenRequestEvent, McpBrowserCloseRequestEvent } from './types.js';
import type { GetElementStylesRequest, GetElementStylesResult } from '../cssResolvers/types.js';

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

	/**
	 * Fired when user clicks "Open Source" in browser context menu
	 * Contains parsed source location from data-roopik-source attribute
	 */
	readonly onOpenSourceRequest: Event<OpenSourceRequestEvent>;

	/**
	 * Fired when user clicks "Attach Element to Context" in browser context menu
	 * Works WITHOUT inspect mode - directly from right-click
	 */
	readonly onAttachElementRequest: Event<AttachElementRequestEvent>;

	/**
	 * Fired when injected script sends a message via window.__roopikBridge()
	 * Used for element selection, inspect mode events, etc.
	 */
	readonly onBrowserBridgeMessage: Event<BrowserBridgeEvent>;

	/**
	 * Fired when a key is pressed in the browser view
	 * Centralized key handling - all key presses from BrowserView are forwarded here
	 * Replaces scattered key handling in injected scripts
	 */
	readonly onBrowserKeyPress: Event<BrowserKeyEvent>;

	/**
	 * Fired when MCP requests browser to be opened
	 * Renderer listens and opens the browser editor with proper UI
	 * Used by MCP tools (browser_open) when no browser is currently open
	 */
	readonly onMcpBrowserOpenRequest: Event<McpBrowserOpenRequestEvent>;

	/**
	 * Fired when MCP requests browser to be closed
	 * Renderer listens and closes the editor tab properly (triggers full cleanup chain)
	 * Used by MCP tools (browser_close) to ensure proper cleanup
	 */
	readonly onMcpBrowserCloseRequest: Event<McpBrowserCloseRequestEvent>;

	// ============================================
	// Browser View Lifecycle
	// ============================================

	/**
	 * Create a new browser WebContentsView
	 * @param windowId - The parent window ID
	 * @returns Browser view ID and debugging port
	 */
	createBrowserView(windowId: number, tabId?: number): Promise<BrowserViewResult & { tabId: number }>;

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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	sendCDPCommand(browserViewId: number, method: string, params?: any): Promise<any>;

	/**
	 * Setup the browser bridge for script-to-main communication
	 * Creates window.__roopikBridge() in the page via CDP Runtime.addBinding
	 * Must be called before injecting inspect script
	 */
	setupBrowserBridge(browserViewId: number): Promise<void>;

	// ============================================
	// Utilities
	// ============================================

	/**
	 * Take screenshot
	 */
	takeScreenshot(browserViewId: number): Promise<string>;

	/**
	 * Take screenshot of a specific region (clip mode)
	 * Coordinates are viewport-relative (clientX/Y from browser)
	 */
	takeScreenshotClip(browserViewId: number, x: number, y: number, width: number, height: number): Promise<string>;

	/**
	 * Capture screenshot of a specific element using CDP DOM.getBoxModel
	 * This provides pixel-perfect bounds for accurate element screenshots
	 *
	 * @param browserViewId - The browser view ID
	 * @param selector - CSS selector to find the element
	 * @returns Base64 data URL of the element screenshot, or null if element not found
	 */
	captureElementScreenshot(browserViewId: number, selector: string): Promise<string | null>;

	/**
	 * Focus the browser view to receive keyboard events
	 */
	focusBrowserView(browserViewId: number): Promise<void>;

	/**
	 * Execute JavaScript in browser
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
	// CSS Source Resolution (for Inspect Panel)
	// ============================================

	/**
	 * Get complete style information for an element
	 *
	 * Uses CDP (Chrome DevTools Protocol) for deterministic source resolution.
	 * Returns all matched CSS rules with source file locations, handling:
	 * - Plain CSS files
	 * - SCSS/LESS (via source maps)
	 * - CSS-in-JS (with component redirect)
	 * - Inline styles
	 *
	 * @param request - Element identification and project context
	 * @returns Complete style information including source locations
	 */
	getElementStyles(request: GetElementStylesRequest): Promise<GetElementStylesResult>;
}
