/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { ITitleService } from '../../../../services/title/browser/titleService.js';

export const IMenubarStateService = createDecorator<IMenubarStateService>('menubarStateService');

/**
 * Service that tracks custom menubar state (open/closed).
 * Used to pause BrowserView/WebContentsView which render on top of HTML menus.
 *
 * This works with VSCode's custom HTML-based menubar (used on Windows/Linux when
 * "window.titleBarStyle": "custom").
 */
export interface IMenubarStateService {
	readonly _serviceBrand: undefined;

	/**
	 * Fired when the menubar gains focus (e.g., when a menu is opened).
	 */
	readonly onDidOpenMenu: Event<void>;

	/**
	 * Fired when the menubar loses focus (e.g., when a menu is closed).
	 */
	readonly onDidCloseMenu: Event<void>;

	/**
	 * Whether any menu is currently open/focused.
	 */
	readonly isMenuOpen: boolean;
}

class MenubarStateService extends Disposable implements IMenubarStateService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidOpenMenu = this._register(new Emitter<void>());
	readonly onDidOpenMenu = this._onDidOpenMenu.event;

	private readonly _onDidCloseMenu = this._register(new Emitter<void>());
	readonly onDidCloseMenu = this._onDidCloseMenu.event;

	private _isMenuOpen = false;

	get isMenuOpen(): boolean {
		return this._isMenuOpen;
	}

	constructor(
		@ITitleService private readonly titleService: ITitleService
	) {
		super();

		// Listen for menubar focus state changes from the custom HTML-based menubar
		this._register(this.titleService.onMenubarFocusStateChange(focused => {
			if (focused) {
				this._isMenuOpen = true;
				this._onDidOpenMenu.fire();
			} else {
				this._isMenuOpen = false;
				this._onDidCloseMenu.fire();
			}
		}));
	}
}

registerSingleton(IMenubarStateService, MenubarStateService, InstantiationType.Eager);
