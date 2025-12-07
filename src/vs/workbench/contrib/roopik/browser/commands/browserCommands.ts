/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Browser Commands
 *
 * Commands for browser preview (Mode 2).
 * - roopik.openProjectPreview: Open browser preview with DevTools
 */

import { localize2 } from '../../../../../nls.js';
import { registerAction2, Action2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IEditorGroupsService, preferredSideBySideGroupDirection } from '../../../../services/editor/common/editorGroupsService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { EditorTabInput } from '../projectMode/editorTabInput.js';

/**
 * Register all browser-related commands
 */
export function registerBrowserCommands(): void {
	// Open Browser Project Preview (Mode 2 with embedded DevTools) - SINGLETON
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.openProjectPreview',
				title: localize2('roopik.openProjectPreview', 'Open Browser Preview'),
				category: localize2('roopik.category', 'Roopik'),
				f1: true
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const editorService = accessor.get(IEditorService);
			const editorGroupsService = accessor.get(IEditorGroupsService);
			const configurationService = accessor.get(IConfigurationService);
			const notificationService = accessor.get(INotificationService);
			const storageService = accessor.get(IStorageService);

			// SINGLETON: Get the one and only browser instance
			const input = EditorTabInput.getInstance();

			// Check if browser editor is already open in any group
			const visibleEditors = editorService.visibleEditorPanes;
			const existingPane = visibleEditors.find(
				pane => pane.input instanceof EditorTabInput
			);

			if (existingPane) {
				// Focus existing editor in its current group
				await existingPane.group.openEditor(input, { pinned: true });
				return;
			}

			// Open in side group (SIDE_GROUP) by default
			const direction = preferredSideBySideGroupDirection(configurationService);
			let targetGroup = editorGroupsService.findGroup({ direction });
			if (!targetGroup) {
				targetGroup = editorGroupsService.addGroup(editorGroupsService.activeGroup, direction);
			}
			await targetGroup.openEditor(input, { pinned: true });

			// Show hint notification (once per installation)
			const hintKey = 'roopik.browserRightSideHintShown';
			const hintShown = storageService.getBoolean(hintKey, StorageScope.APPLICATION, false);

			if (!hintShown) {
				notificationService.notify({
					severity: Severity.Info,
					message: 'Tip: Keep browser on the right side to avoid blocking menu items.',
					sticky: false
				});
				storageService.store(hintKey, true, StorageScope.APPLICATION, 0 /* StorageTarget.USER */);
			}
		}
	});
}
