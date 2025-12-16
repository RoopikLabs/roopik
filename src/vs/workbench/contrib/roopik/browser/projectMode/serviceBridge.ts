/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { IChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import type { IProjectModeService } from '../../common/projectMode/ipc.js';
import type { ViewBounds, BrowserViewResult, DevToolsViewResult, NavigationState, CDPDomains, DevToolsOptions, DevToolsClosedEvent, NavigationStateChangedEvent, OpenSourceRequestEvent, BrowserBridgeEvent } from '../../common/projectMode/types.js';
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
	 * Event fired when injected script sends a message via window.__roopikBridge()
	 * Used for element selection, inspect mode events, etc.
	 */
	readonly onBrowserBridgeMessage: Event<BrowserBridgeEvent>;

	constructor(private channel: IChannel) {
		// Subscribe to events from main process
		this.onDevToolsClosed = this.channel.listen<DevToolsClosedEvent>('onDevToolsClosed');
		this.onNavigationStateChanged = this.channel.listen<NavigationStateChangedEvent>('onNavigationStateChanged');
		this.onOpenSourceRequest = this.channel.listen<OpenSourceRequestEvent>('onOpenSourceRequest');
		this.onBrowserBridgeMessage = this.channel.listen<BrowserBridgeEvent>('onBrowserBridgeMessage');
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
}
