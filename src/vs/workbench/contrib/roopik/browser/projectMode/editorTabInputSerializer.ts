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
	tabId: number;
}

/**
 * Serializer for EditorTabInput
 * Enables VS Code to restore browser preview tabs with the same URL after reload
 *
 * Multi-tab: Each tab is serialized/deserialized with its tabId.
 * On restore, new tabIds are assigned (backend assigns fresh IDs on createBrowserView).
 */
export class EditorTabInputSerializer implements IEditorSerializer {
	canSerialize(editorInput: EditorInput): boolean {
		return editorInput instanceof EditorTabInput;
	}

	serialize(editorInput: EditorInput): string {
		if (editorInput instanceof EditorTabInput) {
			const data: ISerializedEditorTabInput = {
				url: editorInput.url,
				pageTitle: editorInput.pageTitle,
				tabId: editorInput.tabId
			};
			return JSON.stringify(data);
		}
		return '';
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
		try {
			const data = JSON.parse(serializedEditorInput) as ISerializedEditorTabInput;
			// Create a new tab with a fresh local ID (backend will assign real tabId on createBrowserView)
			const input = new EditorTabInput(EditorTabInput.nextLocalTabId());

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
			return new EditorTabInput(EditorTabInput.nextLocalTabId());
		}
	}
}
