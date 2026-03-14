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
 * Editor Tab Input - Defines a browser preview tab identity
 *
 * Multi-tab: Each browser tab gets its own EditorTabInput instance with a unique tabId.
 * The tabId links to the backend's stable tab identifier.
 * Each instance has a unique resource URI so VS Code treats them as separate editor tabs.
 */
export class EditorTabInput extends EditorInput {
	static readonly ID = 'roopik.editorTabInput';

	// Track all open instances for lookup
	private static readonly _instances = new Map<number, EditorTabInput>();
	private static _nextLocalId = 1;

	private _url: string = 'about:blank';
	private _pageTitle: string = '';
	private _favicon: string | undefined;

	constructor(
		private readonly _tabId: number
	) {
		super();
		EditorTabInput._instances.set(_tabId, this);
	}

	get tabId(): number {
		return this._tabId;
	}

	/**
	 * Get an existing instance by tabId, or undefined if not found.
	 */
	static getByTabId(tabId: number): EditorTabInput | undefined {
		return EditorTabInput._instances.get(tabId);
	}

	/**
	 * Get all open browser tab inputs.
	 */
	static getAll(): EditorTabInput[] {
		return Array.from(EditorTabInput._instances.values());
	}

	/**
	 * Get a monotonically increasing local tab ID for creating new tabs.
	 * This is used as a placeholder until the backend assigns the real tabId.
	 */
	static nextLocalTabId(): number {
		return EditorTabInput._nextLocalId++;
	}

	override get typeId(): string {
		return EditorTabInput.ID;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.None;
	}

	override get resource(): URI {
		return URI.parse(`roopik-browser://browser/tab/${this._tabId}`);
	}

	// Max length for tab title
	private static readonly TAB_TITLE_MAX_LENGTH = 15;

	override getName(): string {
		if (this._pageTitle) {
			return truncate(this._pageTitle, EditorTabInput.TAB_TITLE_MAX_LENGTH);
		}

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
		if (this._favicon && this._favicon.length > 0) {
			try {
				return URI.parse(this._favicon);
			} catch {
				return browserTabIcon;
			}
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

	setPageTitle(title: string): void {
		if (this._pageTitle !== title) {
			this._pageTitle = title;
			this._onDidChangeLabel.fire();
		}
	}

	get pageTitle(): string {
		return this._pageTitle;
	}

	setFavicon(favicon: string | undefined): void {
		if (this._favicon !== favicon) {
			this._favicon = favicon;
			this._onDidChangeLabel.fire();
		}
	}

	override matches(other: EditorInput): boolean {
		return other instanceof EditorTabInput && other._tabId === this._tabId;
	}

	override dispose(): void {
		EditorTabInput._instances.delete(this._tabId);
		super.dispose();
	}
}
