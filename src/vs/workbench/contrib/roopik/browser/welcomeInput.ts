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

export class RoopikWelcomeInput extends EditorInput {
	static readonly ID = 'roopik.welcomeInput';
	static readonly RESOURCE = URI.parse('roopik://welcome');

	private static _instance: RoopikWelcomeInput | undefined;

	static getInstance(): RoopikWelcomeInput {
		if (!RoopikWelcomeInput._instance) {
			RoopikWelcomeInput._instance = new RoopikWelcomeInput();
		}
		return RoopikWelcomeInput._instance;
	}

	constructor() {
		super();
	}

	override get typeId(): string {
		return RoopikWelcomeInput.ID;
	}

	override get resource(): URI {
		return RoopikWelcomeInput.RESOURCE;
	}

	override getName(): string {
		return 'Roopik Welcome';
	}

	override getIcon(): ThemeIcon {
		return Codicon.colorMode;
	}

	override async resolve(): Promise<null> {
		return null;
	}

	override matches(other: EditorInput): boolean {
		return other instanceof RoopikWelcomeInput;
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
		return '';
	}

	deserialize(instantiationService: IInstantiationService): EditorInput {
		return RoopikWelcomeInput.getInstance();
	}
}
