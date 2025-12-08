/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IToolData, IToolImpl, IToolInvocation, IToolResult, ToolDataSource } from '../../chat/common/languageModelToolsService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';

export const CreateComponentToolId = 'roopik_createComponent';

export const CreateComponentToolData: IToolData = {
	id: CreateComponentToolId,
	displayName: 'Create Component',
	modelDescription: 'Creates a new React component file in the project.',
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			filename: {
				type: 'string',
				description: 'The name of the file to create (e.g., "Button.tsx")'
			},
			code: {
				type: 'string',
				description: 'The full code content of the component'
			}
		},
		required: ['filename', 'code']
	}
};

export class CreateComponentTool extends Disposable implements IToolImpl {
	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService
	) {
		super();
	}

	async invoke(invocation: IToolInvocation, countTokens: any, progress: any, token: CancellationToken): Promise<IToolResult> {
		const params = invocation.parameters as { filename: string; code: string };

		// 1. Resolve the path
		const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
		if (workspaceFolders.length === 0) {
			throw new Error('No workspace open');
		}

		const root = workspaceFolders[0].uri;
		// For MVP, we assume a standard structure or just put it in src/components
		// We will ensure the directory exists implicitly by using IFileService (it might fail if dir doesn't exist, but let's try)
		const targetUri = URI.joinPath(root, 'src', 'components', params.filename);

		// 2. Write the file
		try {
			await this.fileService.writeFile(targetUri, VSBuffer.fromString(params.code));
			return {
				content: [{ kind: 'text', value: `Successfully created component at ${targetUri.fsPath}` }]
			};
		} catch (error) {
			return {
				content: [{ kind: 'text', value: `Error creating component: ${error}` }]
			};
		}
	}
}
