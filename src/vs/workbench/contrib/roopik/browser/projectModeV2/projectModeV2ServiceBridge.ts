/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import type { IProjectModeV2Service } from '../../common/projectModeV2/ipc.js';
import type { ViewBounds, DevicePreset, BrowserViewResult, DevToolsViewResult, NavigationState, CDPDomains } from '../../common/projectModeV2/types.js';

/**
 * ProjectModeV2 Service Bridge
 *
 * Renderer-side proxy that communicates with main process via IPC.
 */
export class ProjectModeV2ServiceBridge implements IProjectModeV2Service {
	readonly _serviceBrand: undefined;

	constructor(private channel: IChannel) { }

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

	async openDevTools(browserViewId: number, bounds: ViewBounds): Promise<DevToolsViewResult> {
		return this.channel.call('openDevTools', { browserViewId, bounds });
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
}
