/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from '../../../../common/editor/editorInput.js';
import { EditorInputCapabilities } from '../../../../common/editor.js';
import { URI } from '../../../../../base/common/uri.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { truncate } from '../../../../../base/common/strings.js';

const browserTabIcon = registerIcon('roopik-browser-tab', Codicon.globe, 'Icon for Browser Preview tab');

/**
 * Editor Tab Input - Defines the browser preview tab identity
 *
 * This is a TRUE SINGLETON - only ONE browser preview tab can exist at a time.
 * Clicking "Open Browser Preview" again will focus the existing tab.
 *
 * Responsibilities:
 * - Tab icon and title
 * - URL and page title state
 * - Singleton enforcement
 */
export class EditorTabInput extends EditorInput {
	static readonly ID = 'roopik.editorTabInput';
	static readonly RESOURCE = URI.parse('roopik-browser://browser/singleton');

	// TRUE SINGLETON - only one instance ever
	private static _welcomeInstance: EditorTabInput | undefined;
	private static _settingsInstance: EditorTabInput | undefined;

	private _url: string = 'about:blank';
	private _pageTitle: string = '';
	private _favicon: string | undefined;

	/**
	 * Get the singleton browser instance.
	 * Creates it if it doesn't exist.
	 * ALWAYS use this method - never call constructor directly.
	 */
	static getInstance(viewMode: 'welcome' | 'settings' = 'welcome'): EditorTabInput {
		if (viewMode === 'settings') {
			if (!EditorTabInput._settingsInstance) {
				EditorTabInput._settingsInstance = new EditorTabInput();
			}
			return EditorTabInput._settingsInstance;
		}
		if (!EditorTabInput._welcomeInstance) {
			EditorTabInput._welcomeInstance = new EditorTabInput();
		}
		return EditorTabInput._welcomeInstance;
	}

	/**
	 * Constructor - DO NOT call directly!
	 * Use getInstance() instead.
	 * Public constructor required for VSCode's SyncDescriptor registration.
	 */
	constructor() {
		super();
		// Enforce singleton: if instance exists, return it
		if (EditorTabInput._welcomeInstance) {
			return EditorTabInput._welcomeInstance;
		}
		EditorTabInput._welcomeInstance = this;
	}

	override get typeId(): string {
		return EditorTabInput.ID;
	}

	/**
	 * Singleton capability prevents this editor from being split.
	 */
	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Singleton;
	}

	override get resource(): URI {
		return EditorTabInput.RESOURCE;
	}

	// Max length for tab title
	private static readonly TAB_TITLE_MAX_LENGTH = 15;

	override getName(): string {
		// Use page title if available
		if (this._pageTitle) {
			return truncate(this._pageTitle, EditorTabInput.TAB_TITLE_MAX_LENGTH);
		}

		// Fallback to hostname or default
		if (this._url === 'about:blank') {
			return 'Browser Preview';
		}
		try {
			const url = new URL(this._url);
			return url.hostname || 'Browser Preview';
		} catch {
			return 'Browser Preview';
		}
	}

	override getIcon(): ThemeIcon | URI {
		// Use favicon if available, otherwise fall back to globe icon
		if (this._favicon) {
			return URI.parse(this._favicon);
		}
		return browserTabIcon;
	}

	get url(): string {
		return this._url;
	}

	setUrl(url: string): void {
		if (this._url !== url) {
			this._url = url;
			this._onDidChangeLabel.fire();
		}
	}

	/**
	 * Set page title (from browser's document.title)
	 */
	setPageTitle(title: string): void {
		if (this._pageTitle !== title) {
			this._pageTitle = title;
			this._onDidChangeLabel.fire();
		}
	}

	get pageTitle(): string {
		return this._pageTitle;
	}

	/**
	 * Set favicon URL (from page-favicon-updated event)
	 */
	setFavicon(favicon: string | undefined): void {
		if (this._favicon !== favicon) {
			this._favicon = favicon;
			this._onDidChangeLabel.fire();
		}
	}

	override matches(other: EditorInput): boolean {
		// Always match if it's a EditorTabInput - there's only one!
		return other instanceof EditorTabInput;
	}

	override dispose(): void {
		// Clear singleton reference so a fresh instance is created next time
		if (EditorTabInput._welcomeInstance === this) {
			EditorTabInput._welcomeInstance = undefined;
		}
		if (EditorTabInput._settingsInstance === this) {
			EditorTabInput._settingsInstance = undefined;
		}
		super.dispose();
	}
}
