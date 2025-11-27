/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from '../../../common/editor/editorInput.js';
import { URI } from '../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorSerializer } from '../../../common/editor.js';

export type WelcomeViewMode = 'welcome' | 'settings';

export class RoopikWelcomeInput extends EditorInput {
	static readonly ID = 'roopik.welcomeInput';
	static readonly RESOURCE = URI.parse('roopik://welcome');

	private static _welcomeInstance: RoopikWelcomeInput | undefined;
	private static _settingsInstance: RoopikWelcomeInput | undefined;

	private readonly _viewMode: WelcomeViewMode;

	static getInstance(viewMode: WelcomeViewMode = 'welcome'): RoopikWelcomeInput {
		if (viewMode === 'settings') {
			if (!RoopikWelcomeInput._settingsInstance) {
				RoopikWelcomeInput._settingsInstance = new RoopikWelcomeInput('settings');
			}
			return RoopikWelcomeInput._settingsInstance;
		}

		if (!RoopikWelcomeInput._welcomeInstance) {
			RoopikWelcomeInput._welcomeInstance = new RoopikWelcomeInput('welcome');
		}
		return RoopikWelcomeInput._welcomeInstance;
	}

	constructor(viewMode: WelcomeViewMode = 'welcome') {
		super();
		this._viewMode = viewMode;
	}

	get viewMode(): WelcomeViewMode {
		return this._viewMode;
	}

	override get typeId(): string {
		return RoopikWelcomeInput.ID;
	}

	override get resource(): URI {
		// Use different URIs for welcome vs settings to allow separate tabs
		if (this._viewMode === 'settings') {
			return URI.parse('roopik://settings');
		}
		return RoopikWelcomeInput.RESOURCE;
	}

	override getName(): string {
		if (this._viewMode === 'settings') {
			return 'Roopik Settings';
		}
		return 'Roopik Welcome';
	}

	override getIcon(): ThemeIcon {
		if (this._viewMode === 'settings') {
			return Codicon.settingsGear;
		}
		return Codicon.colorMode;
	}

	override async resolve(): Promise<null> {
		return null;
	}

	override matches(other: EditorInput): boolean {
		if (other instanceof RoopikWelcomeInput) {
			// Only match if same view mode
			return other._viewMode === this._viewMode;
		}
		return false;
	}

	override dispose(): void {
		// Clear singleton reference so a fresh instance is created next time
		if (RoopikWelcomeInput._welcomeInstance === this) {
			RoopikWelcomeInput._welcomeInstance = undefined;
		}
		if (RoopikWelcomeInput._settingsInstance === this) {
			RoopikWelcomeInput._settingsInstance = undefined;
		}
		super.dispose();
	}
}

/**
 * Serializer for RoopikWelcomeInput
 * Enables VSCode to restore welcome screen on reload
 */
export class RoopikWelcomeInputSerializer implements IEditorSerializer {
	canSerialize(editorInput: EditorInput): boolean {
		return editorInput instanceof RoopikWelcomeInput;
	}

	serialize(editorInput: EditorInput): string {
		if (editorInput instanceof RoopikWelcomeInput) {
			return JSON.stringify({ viewMode: editorInput.viewMode });
		}
		return '';
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
		try {
			const data = JSON.parse(serializedEditorInput);
			return RoopikWelcomeInput.getInstance(data.viewMode || 'welcome');
		} catch {
			return RoopikWelcomeInput.getInstance('welcome');
		}
	}
}
