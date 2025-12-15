/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { IServerChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import type { IProjectModeService } from '../../common/projectMode/ipc.js';

/**
 * IPC Channel for ProjectMode
 *
 * Routes calls from renderer process to main process BrowserViewService.
 */
export class ProjectModeChannel implements IServerChannel {
	constructor(private service: IProjectModeService) { }

	listen(_: unknown, event: string): Event<any> {
		switch (event) {
			case 'onDevToolsClosed':
				return this.service.onDevToolsClosed;
			case 'onNavigationStateChanged':
				return this.service.onNavigationStateChanged;
			case 'onOpenSourceRequest':
				return this.service.onOpenSourceRequest;
			default:
				throw new Error(`[ProjectModeChannel] Unknown event: ${event}`);
		}
	}

	call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			// Browser View Lifecycle
			case 'createBrowserView':
				return this.service.createBrowserView(arg);
			case 'destroyBrowserView':
				return this.service.destroyBrowserView(arg);
			case 'setBrowserBounds':
				return this.service.setBrowserBounds(arg.browserViewId, arg.bounds);
			case 'setBrowserVisible':
				return this.service.setBrowserVisible(arg.browserViewId, arg.visible);

			// Navigation
			case 'navigate':
				return this.service.navigate(arg.browserViewId, arg.url);
			case 'goBack':
				return this.service.goBack(arg);
			case 'goForward':
				return this.service.goForward(arg);
			case 'reload':
				return this.service.reload(arg.browserViewId, arg.ignoreCache);
			case 'stop':
				return this.service.stop(arg);
			case 'getNavigationState':
				return this.service.getNavigationState(arg);

			// DevTools
			case 'openDevTools':
				return this.service.openDevTools(arg.browserViewId, arg.options);
			case 'closeDevTools':
				return this.service.closeDevTools(arg);
			case 'setDevToolsBounds':
				return this.service.setDevToolsBounds(arg.browserViewId, arg.bounds);
			case 'isDevToolsOpen':
				return this.service.isDevToolsOpen(arg);

			// CDP
			case 'attachDebugger':
				return this.service.attachDebugger(arg.browserViewId, arg.protocolVersion);
			case 'detachDebugger':
				return this.service.detachDebugger(arg);
			case 'enableCDPDomains':
				return this.service.enableCDPDomains(arg.browserViewId, arg.domains);
			case 'sendCDPCommand':
				return this.service.sendCDPCommand(arg.browserViewId, arg.method, arg.params);

			// Device Emulation
			case 'setDeviceEmulation':
				return this.service.setDeviceEmulation(arg.browserViewId, arg.device);
			case 'clearDeviceEmulation':
				return this.service.clearDeviceEmulation(arg);

			// Utilities
			case 'takeScreenshot':
				return this.service.takeScreenshot(arg);
			case 'executeScript':
				return this.service.executeScript(arg.browserViewId, arg.script);
			case 'getPageHTML':
				return this.service.getPageHTML(arg);
			case 'getDebuggingUrl':
				return this.service.getDebuggingUrl(arg);

			// Overlay View
			case 'createOverlayView':
				return this.service.createOverlayView(arg.browserViewId, arg.bounds, arg.htmlContent);
			case 'setOverlayBounds':
				return this.service.setOverlayBounds(arg.overlayViewId, arg.bounds);
			case 'setOverlayContent':
				return this.service.setOverlayContent(arg.overlayViewId, arg.htmlContent);
			case 'setOverlayVisible':
				return this.service.setOverlayVisible(arg.overlayViewId, arg.visible);
			case 'destroyOverlayView':
				return this.service.destroyOverlayView(arg);
			case 'executeScriptOnOverlay':
				return this.service.executeScriptOnOverlay(arg.overlayViewId, arg.script);

			// CSS Source Resolution
			case 'getElementStyles':
				return this.service.getElementStyles(arg);

			default:
				throw new Error(`[ProjectModeChannel] Unknown command: ${command}`);
		}
	}
}
