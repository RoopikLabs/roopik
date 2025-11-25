/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from '../../../../common/editor/editorInput.js';
import { URI } from '../../../../../base/common/uri.js';
import { IEditorSerializer } from '../../../../common/editor.js';

/**
 * Project Mode Input
 *
 * Represents a browser preview session for a project.
 * Each input maintains its own URL and browsing history.
 */
export class ProjectModeInput extends EditorInput {
	static readonly ID = 'roopik.projectModeInput';

	private _url: string;
	private _resource: URI;

	constructor(
		initialUrl: string = 'about:blank'
	) {
		super();
		this._url = initialUrl;
		this._resource = URI.parse('roopik://project-preview');
	}

	override get typeId(): string {
		return ProjectModeInput.ID;
	}

	override get resource(): URI {
		return this._resource;
	}

	override getName(): string {
		return 'Project Preview';
	}

	override getDescription(): string {
		return this._url;
	}

	get url(): string {
		return this._url;
	}

	setUrl(url: string): void {
		this._url = url;
		this._onDidChangeLabel.fire();
	}

	override matches(other: EditorInput): boolean {
		return other instanceof ProjectModeInput;
	}

	override toUntyped() {
		return {
			resource: this._resource,
			options: {
				override: ProjectModeInput.ID
			}
		};
	}
}

/**
 * Serializer for ProjectModeInput
 * Allows VSCode to restore project preview editors on reload
 */
export class ProjectModeInputSerializer implements IEditorSerializer {
	canSerialize(): boolean {
		return true;
	}

	serialize(input: ProjectModeInput): string {
		return JSON.stringify({
			url: input.url
		});
	}

	deserialize(instantiationService: any, serializedInput: string): ProjectModeInput {
		try {
			const data = JSON.parse(serializedInput);
			return new ProjectModeInput(data.url || 'about:blank');
		} catch {
			return new ProjectModeInput();
		}
	}
}
