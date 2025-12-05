/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { IChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import type { IProjectModeService } from '../../common/projectMode/ipc.js';
import type { ViewBounds, DevicePreset, BrowserViewResult, DevToolsViewResult, NavigationState, CDPDomains, DevToolsOptions, DevToolsClosedEvent, NavigationStateChangedEvent } from '../../common/projectMode/types.js';

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

	constructor(private channel: IChannel) {
		// Subscribe to events from main process
		this.onDevToolsClosed = this.channel.listen<DevToolsClosedEvent>('onDevToolsClosed');
		this.onNavigationStateChanged = this.channel.listen<NavigationStateChangedEvent>('onNavigationStateChanged');
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

	async setDevToolsBounds(browserViewId: number, bounds: ViewBounds): Promise<void> {
		return this.channel.call('setDevToolsBounds', { browserViewId, bounds });
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

	// ============================================
	// Device Emulation
	// ============================================

	async setDeviceEmulation(browserViewId: number, device: DevicePreset): Promise<void> {
		return this.channel.call('setDeviceEmulation', { browserViewId, device });
	}

	async clearDeviceEmulation(browserViewId: number): Promise<void> {
		return this.channel.call('clearDeviceEmulation', browserViewId);
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
	// Overlay View
	// ============================================

	async createOverlayView(browserViewId: number, bounds: ViewBounds, htmlContent: string): Promise<number> {
		return this.channel.call('createOverlayView', { browserViewId, bounds, htmlContent });
	}

	async setOverlayBounds(overlayViewId: number, bounds: ViewBounds): Promise<void> {
		return this.channel.call('setOverlayBounds', { overlayViewId, bounds });
	}

	async setOverlayContent(overlayViewId: number, htmlContent: string): Promise<void> {
		return this.channel.call('setOverlayContent', { overlayViewId, htmlContent });
	}

	async setOverlayVisible(overlayViewId: number, visible: boolean): Promise<void> {
		return this.channel.call('setOverlayVisible', { overlayViewId, visible });
	}

	async destroyOverlayView(overlayViewId: number): Promise<void> {
		return this.channel.call('destroyOverlayView', overlayViewId);
	}

	async executeScriptOnOverlay(overlayViewId: number, script: string): Promise<any> {
		return this.channel.call('executeScriptOnOverlay', { overlayViewId, script });
	}
}
