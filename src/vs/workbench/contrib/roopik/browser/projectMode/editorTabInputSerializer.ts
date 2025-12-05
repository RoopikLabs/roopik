/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { IEditorSerializer } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { EditorTabInput } from './editorTabInput.js';

/**
 * Serialized state for EditorTabInput
 */
interface ISerializedEditorTabInput {
	url: string;
	pageTitle: string;
}

/**
 * Serializer for EditorTabInput
 * Enables VS Code to restore browser preview with the same URL after reload
 *
 * This follows the same pattern as other VS Code editors (Search Editor, Chat Editor, etc.)
 */
export class EditorTabInputSerializer implements IEditorSerializer {
	canSerialize(editorInput: EditorInput): boolean {
		return editorInput instanceof EditorTabInput;
	}

	serialize(editorInput: EditorInput): string {
		if (editorInput instanceof EditorTabInput) {
			const data: ISerializedEditorTabInput = {
				url: editorInput.url,
				pageTitle: editorInput.pageTitle
			};
			return JSON.stringify(data);
		}
		return '';
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
		try {
			const data = JSON.parse(serializedEditorInput) as ISerializedEditorTabInput;
			const input = EditorTabInput.getInstance();

			// Restore URL and page title
			if (data.url && data.url !== 'about:blank') {
				input.setUrl(data.url);
			}
			if (data.pageTitle) {
				input.setPageTitle(data.pageTitle);
			}

			return input;
		} catch {
			// On error, return a fresh instance (will show about:blank)
			return EditorTabInput.getInstance();
		}
	}
}

