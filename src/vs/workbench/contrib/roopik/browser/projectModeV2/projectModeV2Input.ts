/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from '../../../../common/editor/editorInput.js';
import { URI } from '../../../../../base/common/uri.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';

const projectModeV2Icon = registerIcon('roopik-project-mode-v2', Codicon.globe, 'Icon for Project Mode V2 (Browser Preview with DevTools)');

/**
 * Project Mode V2 Editor Input
 *
 * Represents a browser preview session with embedded DevTools.
 */
export class ProjectModeV2Input extends EditorInput {
	static readonly ID = 'roopik.projectModeV2Input';

	private _url: string;

	constructor(url: string = 'about:blank') {
		super();
		this._url = url;
	}

	override get typeId(): string {
		return ProjectModeV2Input.ID;
	}

	override get resource(): URI | undefined {
		return URI.parse(`roopik-browser-v2://${this._url}`);
	}

	override getName(): string {
		if (this._url === 'about:blank') {
			return 'Browser Preview V2';
		}
		try {
			const url = new URL(this._url);
			return url.hostname || 'Browser Preview V2';
		} catch {
			return 'Browser Preview V2';
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

	override matches(other: EditorInput): boolean {
		return other instanceof ProjectModeV2Input;
	}
}
