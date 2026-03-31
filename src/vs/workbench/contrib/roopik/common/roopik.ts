/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * Service interfaces for Roopik Design IDE
 * These are programmatically callable by both UI and AI agents
 */

// Canvas State Service - Manages canvas state (Mode 1)
export const ICanvasStateService = createDecorator<ICanvasStateService>('roopikCanvasStateService');

export interface ICanvasStateService {
	readonly _serviceBrand: undefined;

	// Canvas operations
	createCanvas(name: string): Promise<string>;
	getCanvas(id: string): Promise<any>;
	deleteCanvas(id: string): Promise<void>;
}

// Inspect Service - Element inspection in browser preview (Mode 2)
export const IInspectService = createDecorator<IInspectService>('roopikInspectService');

export interface IInspectService {
	readonly _serviceBrand: undefined;

	// Inspect operations
	inspectElement(selector: string): Promise<any>;
	getComputedStyles(selector: string): Promise<any>;
}

// Style Service - CSS source mapping and live editing
export const IStyleService = createDecorator<IStyleService>('roopikStyleService');

export interface IStyleService {
	readonly _serviceBrand: undefined;

	// Style operations
	getCSSSource(selector: string): Promise<any>;
	updateStyle(selector: string, styles: Record<string, any>): Promise<void>;
}

// BrowserView Service - Manages Electron BrowserView for project preview (Mode 2)
export const IBrowserViewService = createDecorator<IBrowserViewService>('roopikBrowserViewService');

export interface IBrowserViewService {
	readonly _serviceBrand: undefined;

	// BrowserView operations
	createBrowserView(containerId: string): Promise<void>;
	destroyBrowserView(containerId: string): Promise<void>;
	navigateToUrl(containerId: string, url: string): Promise<void>;
	goBack(containerId: string): Promise<void>;
	goForward(containerId: string): Promise<void>;
	reload(containerId: string): Promise<void>;
	openDevTools(containerId: string): Promise<void>;
}
