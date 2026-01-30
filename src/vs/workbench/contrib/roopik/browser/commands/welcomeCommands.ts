/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Welcome Commands
 *
 * Commands for opening welcome screen.
 * - roopik.openWelcome: Open the welcome screen
 */

import { localize2 } from '../../../../../nls.js';
import { registerAction2, Action2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { RoopikWelcomeInput } from '../welcomeInput.js';

/**
 * Register all welcome-related commands
 */
export function registerWelcomeCommands(): void {
	// Open Welcome Screen
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.openWelcome',
				title: localize2('roopik.openWelcome', 'Welcome'),
				category: localize2('roopik.category', 'Roopik'),
				f1: true
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const editorGroupsService = accessor.get(IEditorGroupsService);
			const welcomeInput = RoopikWelcomeInput.getInstance('welcome');
			await editorGroupsService.activeGroup.openEditor(welcomeInput, { pinned: true });
		}
	});
}
