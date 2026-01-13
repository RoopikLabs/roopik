/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { IChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import type { IProjectModeService } from '../../common/projectMode/ipc.js';
import type { ViewBounds, BrowserViewResult, DevToolsViewResult, NavigationState, CDPDomains, DevToolsOptions, DevToolsClosedEvent, NavigationStateChangedEvent, OpenSourceRequestEvent, AttachElementRequestEvent, BrowserBridgeEvent, BrowserKeyEvent, McpBrowserOpenRequestEvent, McpBrowserCloseRequestEvent } from '../../common/projectMode/types.js';
import type { GetElementStylesRequest, GetElementStylesResult } from '../../common/cssResolvers/types.js';

/**
 * Service Bridge
 *
 * Renderer-side proxy that communicates with main process via IPC.
 */
export class ServiceBridge implements IProjectModeService {
	readonly _serviceBrand: undefined;

	// ============================================
	// Events
	// ============================================

	/**
	 * Event fired when DevTools is closed externally (via built-in X button)
	 */
	readonly onDevToolsClosed: Event<DevToolsClosedEvent>;

	/**
	 * Event fired when navigation state changes (URL, title, loading, back/forward)
	 * Replaces polling for navigation state updates
	 */
	readonly onNavigationStateChanged: Event<NavigationStateChangedEvent>;

	/**
	 * Event fired when user clicks "Open Source" in browser context menu
	 * Contains parsed source location from data-roopik-source attribute
	 */
	readonly onOpenSourceRequest: Event<OpenSourceRequestEvent>;

	/**
	 * Event fired when user clicks "Attach Element to Context" in browser context menu
	 * Works WITHOUT inspect mode - directly from right-click
	 */
	readonly onAttachElementRequest: Event<AttachElementRequestEvent>;

	/**
	 * Event fired when injected script sends a message via window.__roopikBridge()
	 * Used for element selection, inspect mode events, etc.
	 */
	readonly onBrowserBridgeMessage: Event<BrowserBridgeEvent>;

	/**
	 * Event fired when a key is pressed in the browser view
	 * Centralized key handling - all key presses from BrowserView are forwarded here
	 */
	readonly onBrowserKeyPress: Event<BrowserKeyEvent>;

	/**
	 * Event fired when MCP requests browser to be opened
	 * Used by MCP tools (browser_open) when no browser is currently open
	 */
	readonly onMcpBrowserOpenRequest: Event<McpBrowserOpenRequestEvent>;

	/**
	 * Event fired when MCP requests browser to be closed
	 * Used by MCP tools (browser_close) to trigger proper cleanup via editor tab close
	 */
	readonly onMcpBrowserCloseRequest: Event<McpBrowserCloseRequestEvent>;

	constructor(private channel: IChannel) {
		// Subscribe to events from main process
		this.onDevToolsClosed = this.channel.listen<DevToolsClosedEvent>('onDevToolsClosed');
		this.onNavigationStateChanged = this.channel.listen<NavigationStateChangedEvent>('onNavigationStateChanged');
		this.onOpenSourceRequest = this.channel.listen<OpenSourceRequestEvent>('onOpenSourceRequest');
		this.onAttachElementRequest = this.channel.listen<AttachElementRequestEvent>('onAttachElementRequest');
		this.onBrowserBridgeMessage = this.channel.listen<BrowserBridgeEvent>('onBrowserBridgeMessage');
		this.onBrowserKeyPress = this.channel.listen<BrowserKeyEvent>('onBrowserKeyPress');
		this.onMcpBrowserOpenRequest = this.channel.listen<McpBrowserOpenRequestEvent>('onMcpBrowserOpenRequest');
		this.onMcpBrowserCloseRequest = this.channel.listen<McpBrowserCloseRequestEvent>('onMcpBrowserCloseRequest');
	}

	// ============================================
	// Browser View Lifecycle
	// ============================================

	async createBrowserView(windowId: number): Promise<BrowserViewResult> {
		return this.channel.call('createBrowserView', windowId);
	}

	async destroyBrowserView(browserViewId: number): Promise<void> {
		return this.channel.call('destroyBrowserView', browserViewId);
	}

	async setBrowserBounds(browserViewId: number, bounds: ViewBounds): Promise<void> {
		return this.channel.call('setBrowserBounds', { browserViewId, bounds });
	}

	async setBrowserVisible(browserViewId: number, visible: boolean): Promise<void> {
		return this.channel.call('setBrowserVisible', { browserViewId, visible });
	}

	// ============================================
	// Navigation
	// ============================================

	async navigate(browserViewId: number, url: string): Promise<void> {
		return this.channel.call('navigate', { browserViewId, url });
	}

	async goBack(browserViewId: number): Promise<void> {
		return this.channel.call('goBack', browserViewId);
	}

	async goForward(browserViewId: number): Promise<void> {
		return this.channel.call('goForward', browserViewId);
	}

	async reload(browserViewId: number, ignoreCache?: boolean): Promise<void> {
		return this.channel.call('reload', { browserViewId, ignoreCache });
	}

	async stop(browserViewId: number): Promise<void> {
		return this.channel.call('stop', browserViewId);
	}

	async getNavigationState(browserViewId: number): Promise<NavigationState> {
		return this.channel.call('getNavigationState', browserViewId);
	}

	// ============================================
	// DevTools
	// ============================================

	async openDevTools(browserViewId: number, options: DevToolsOptions): Promise<DevToolsViewResult> {
		return this.channel.call('openDevTools', { browserViewId, options });
	}

	async closeDevTools(browserViewId: number): Promise<void> {
		return this.channel.call('closeDevTools', browserViewId);
	}

	async isDevToolsOpen(browserViewId: number): Promise<boolean> {
		return this.channel.call('isDevToolsOpen', browserViewId);
	}

	// ============================================
	// CDP
	// ============================================

	async attachDebugger(browserViewId: number, protocolVersion?: string): Promise<void> {
		return this.channel.call('attachDebugger', { browserViewId, protocolVersion });
	}

	async detachDebugger(browserViewId: number): Promise<void> {
		return this.channel.call('detachDebugger', browserViewId);
	}

	async enableCDPDomains(browserViewId: number, domains: CDPDomains): Promise<void> {
		return this.channel.call('enableCDPDomains', { browserViewId, domains });
	}

	async sendCDPCommand(browserViewId: number, method: string, params?: any): Promise<any> {
		return this.channel.call('sendCDPCommand', { browserViewId, method, params });
	}

	async setupBrowserBridge(browserViewId: number): Promise<void> {
		return this.channel.call('setupBrowserBridge', browserViewId);
	}

	// ============================================
	// Utilities
	// ============================================

	async takeScreenshot(browserViewId: number): Promise<string> {
		return this.channel.call('takeScreenshot', browserViewId);
	}

	async takeScreenshotClip(browserViewId: number, x: number, y: number, width: number, height: number): Promise<string> {
		return this.channel.call('takeScreenshotClip', { browserViewId, x, y, width, height });
	}

	async focusBrowserView(browserViewId: number): Promise<void> {
		return this.channel.call('focusBrowserView', browserViewId);
	}

	async executeScript(browserViewId: number, script: string): Promise<any> {
		return this.channel.call('executeScript', { browserViewId, script });
	}

	async getPageHTML(browserViewId: number): Promise<string> {
		return this.channel.call('getPageHTML', browserViewId);
	}

	async getDebuggingUrl(browserViewId: number): Promise<string> {
		return this.channel.call('getDebuggingUrl', browserViewId);
	}

	// ============================================
	// CSS Source Resolution
	// ============================================

	async getElementStyles(request: GetElementStylesRequest): Promise<GetElementStylesResult> {
		return this.channel.call('getElementStyles', request);
	}

	// ============================================
	// Live Style Editing (Preview)
	// ============================================

	/**
	 * Set an inline style property on an element for live preview.
	 * This applies temporary changes that are visible immediately but not persisted.
	 */
	async setInlineStyle(request: {
		browserViewId: number;
		nodeId: number;
		property: string;
		value: string;
	}): Promise<{ success: boolean; error?: string }> {
		return this.channel.call('setInlineStyle', request);
	}

	/**
	 * Set multiple inline style properties at once for live preview.
	 */
	async setMultipleInlineStyles(request: {
		browserViewId: number;
		nodeId: number;
		styles: Array<{ property: string; value: string }>;
	}): Promise<{ success: boolean; error?: string }> {
		return this.channel.call('setMultipleInlineStyles', request);
	}

	/**
	 * Remove an inline style property for live preview.
	 */
	async removeInlineStyle(request: {
		browserViewId: number;
		nodeId: number;
		property: string;
	}): Promise<{ success: boolean; error?: string }> {
		return this.channel.call('removeInlineStyle', request);
	}
}
