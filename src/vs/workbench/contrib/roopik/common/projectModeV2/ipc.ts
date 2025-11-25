/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import type { ViewBounds, DevicePreset, BrowserViewResult, DevToolsViewResult, NavigationState, CDPDomains } from './types.js';

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
	// DevTools (ON-DEMAND creation)
	// ============================================

	/**
	 * Open DevTools in embedded view
	 * CRITICAL: Creates FRESH WebContentsView on-demand
	 * Must be called immediately before setDevToolsWebContents
	 */
	openDevTools(browserViewId: number, bounds: ViewBounds): Promise<DevToolsViewResult>;

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
}
