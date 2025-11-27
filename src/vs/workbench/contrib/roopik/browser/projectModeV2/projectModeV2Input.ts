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
 * Project Mode V2 Editor Input - TRUE SINGLETON
 *
 * Only ONE browser preview can exist at a time.
 * Clicking "Open Browser Preview" again will focus the existing one.
 */
export class ProjectModeV2Input extends EditorInput {
	static readonly ID = 'roopik.projectModeV2Input';
	static readonly RESOURCE = URI.parse('roopik-browser-v2://browser/singleton');

	// TRUE SINGLETON - only one instance ever
	private static _instance: ProjectModeV2Input | undefined;

	private _url: string = 'about:blank';
	private _pageTitle: string = '';

	/**
	 * Get the singleton browser instance.
	 * Creates it if it doesn't exist.
	 * ALWAYS use this method - never call constructor directly.
	 */
	static getInstance(): ProjectModeV2Input {
		if (!ProjectModeV2Input._instance) {
			ProjectModeV2Input._instance = new ProjectModeV2Input();
		}
		return ProjectModeV2Input._instance;
	}

	/**
	 * Constructor - DO NOT call directly!
	 * Use getInstance() instead.
	 * Public constructor required for VSCode's SyncDescriptor registration.
	 */
	constructor() {
		super();
		// Enforce singleton: if instance exists, return it
		if (ProjectModeV2Input._instance) {
			return ProjectModeV2Input._instance;
		}
		ProjectModeV2Input._instance = this;
	}

	override get typeId(): string {
		return ProjectModeV2Input.ID;
	}

	/**
	 * Singleton capability prevents this editor from being split.
	 */
	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Singleton;
	}

	override get resource(): URI {
		return ProjectModeV2Input.RESOURCE;
	}

	// Max length for tab title
	private static readonly TAB_TITLE_MAX_LENGTH = 15;

	override getName(): string {
		// Use page title if available
		if (this._pageTitle) {
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
		// Always match if it's a ProjectModeV2Input - there's only one!
		return other instanceof ProjectModeV2Input;
	}

	override dispose(): void {
		// Clear singleton reference so a fresh instance is created next time
		if (ProjectModeV2Input._instance === this) {
			ProjectModeV2Input._instance = undefined;
		}
		super.dispose();
	}
}
