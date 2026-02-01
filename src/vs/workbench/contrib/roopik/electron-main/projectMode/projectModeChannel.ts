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
			case 'onAttachElementRequest':
				return this.service.onAttachElementRequest;
			case 'onBrowserBridgeMessage':
				return this.service.onBrowserBridgeMessage;
			case 'onBrowserKeyPress':
				return this.service.onBrowserKeyPress;
			case 'onMcpBrowserOpenRequest':
				return this.service.onMcpBrowserOpenRequest;
			case 'onMcpBrowserCloseRequest':
				return this.service.onMcpBrowserCloseRequest;
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
			case 'setupBrowserBridge':
				return this.service.setupBrowserBridge(arg);

			// Utilities
			case 'takeScreenshot':
				return this.service.takeScreenshot(arg);
			case 'takeScreenshotClip':
				return this.service.takeScreenshotClip(arg.browserViewId, arg.x, arg.y, arg.width, arg.height);
			case 'captureElementScreenshot':
				return this.service.captureElementScreenshot(arg.browserViewId, arg.selector);
			case 'focusBrowserView':
				return this.service.focusBrowserView(arg);
			case 'executeScript':
				return this.service.executeScript(arg.browserViewId, arg.script);
			case 'getPageHTML':
				return this.service.getPageHTML(arg);
			case 'getDebuggingUrl':
				return this.service.getDebuggingUrl(arg);

			// CSS Source Resolution
			case 'getElementStyles':
				return this.service.getElementStyles(arg);

			default:
				throw new Error(`[ProjectModeChannel] Unknown command: ${command}`);
		}
	}
}
