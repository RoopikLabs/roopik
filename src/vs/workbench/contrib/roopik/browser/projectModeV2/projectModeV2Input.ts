/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from '../../../../common/editor/editorInput.js';
import { EditorInputCapabilities } from '../../../../common/editor.js';
import { URI } from '../../../../../base/common/uri.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { truncate } from '../../../../../base/common/strings.js';

const projectModeV2Icon = registerIcon('roopik-project-mode-v2', Codicon.globe, 'Icon for Project Mode V2 (Browser Preview with DevTools)');

/**
 * Project Mode V2 Editor Input
 *
 * Represents a browser preview session with embedded DevTools.
 */
export class ProjectModeV2Input extends EditorInput {
	static readonly ID = 'roopik.projectModeV2Input';

	// Unique instance ID to differentiate browser tabs
	private static instanceCounter = 0;
	private readonly instanceId: number;

	private _url: string;
	private _pageTitle: string = '';

	constructor(url: string = 'about:blank') {
		super();
		this._url = url;
		this.instanceId = ++ProjectModeV2Input.instanceCounter;
	}

	override get typeId(): string {
		return ProjectModeV2Input.ID;
	}

	/**
	 * Singleton capability prevents this editor from being split.
	 * Users can create multiple independent browser tabs from the Welcome Screen,
	 * but cannot duplicate an existing browser tab via split mode.
	 */
	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Singleton;
	}

	override get resource(): URI | undefined {
		// Create a valid URI for VSCode's internal model
		// We encode the actual URL as the path to avoid invalid URI issues
		// e.g., http://localhost:5173/ becomes roopik-browser-v2://browser/http%3A%2F%2Flocalhost%3A5173%2F
		try {
			const encodedUrl = encodeURIComponent(this._url);
			return URI.parse(`roopik-browser-v2://browser/${encodedUrl}`);
		} catch {
			return URI.parse('roopik-browser-v2://browser/blank');
		}
	}

	// Max length for tab title - keep short for consistent tab width
	// Using 15 to account for variable character widths (spaces are narrow)
	private static readonly TAB_TITLE_MAX_LENGTH = 15;

	override getName(): string {
		// Use page title if available (set by editor from browser)
		if (this._pageTitle) {
			// Use VSCode's truncate function for consistent behavior
			return truncate(this._pageTitle, ProjectModeV2Input.TAB_TITLE_MAX_LENGTH);
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

	override getIcon() {
		return projectModeV2Icon;
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
	 * This is what shows in the tab
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

	override matches(other: EditorInput): boolean {
		// Only match if it's the exact same instance
		// This ensures each browser tab is treated as unique and properly disposed when closed
		if (other instanceof ProjectModeV2Input) {
			return this.instanceId === other.instanceId;
		}
		return false;
	}
}
