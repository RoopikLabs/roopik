/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { localize } from '../../../../nls.js';
import { importFromVSCode } from './importFromVSCode.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';

export function registerImportFromVSCodeAction(): void {
	registerAction2(class ImportFromVSCodeAction extends Action2 {
		constructor() {
			super({
				id: 'workbench.action.importFromVSCode',
				title: {
					value: localize('importFromVSCode', "Import Settings from VS Code"),
					original: 'Import Settings from VS Code'
				},
				category: Categories.Preferences,
				f1: true // Show in Command Palette
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const fileService = accessor.get(IFileService);
			const notificationService = accessor.get(INotificationService);
			const dialogService = accessor.get(IDialogService);
			const environmentService = accessor.get(INativeEnvironmentService);

			await importFromVSCode(fileService, notificationService, dialogService, environmentService);
		}
	});
}
