/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { FileAccess } from '../../../../base/common/network.js';

const ROODIO_CATEGORY = localize2('roodio.category', 'Roo Dio');
const ROODIO_OPEN_CHAT_ACTION_ID = 'workbench.action.roodio.openChat';
const ROODIO_CHAT_VIEW_ID = 'roodio.ChatPanel';

// Custom Roo Dio icon (theme-aware)
const ROODIO_ICON = {
	dark: FileAccess.asBrowserUri('vs/workbench/contrib/roopik/browser/media/roodio-icon-dark.svg'),
	light: FileAccess.asBrowserUri('vs/workbench/contrib/roopik/browser/media/roodio-icon-light.svg')
};

// Main action to toggle Roo Dio chat panel
registerAction2(class OpenRoodioChatAction extends Action2 {
	constructor() {
		super({
			id: ROODIO_OPEN_CHAT_ACTION_ID,
			title: localize2('openRoodioChat', "Toggle Roo Dio Chat"),
			category: ROODIO_CATEGORY,
			icon: ROODIO_ICON,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const viewsService = accessor.get(IViewsService);

		// Check if the chat view is currently visible
		const isVisible = viewsService.isViewVisible(ROODIO_CHAT_VIEW_ID);

		if (isVisible) {
			// Hide the auxiliary bar (right sidebar)
			layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		} else {
			// Show the auxiliary bar and focus the chat panel
			layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			await viewsService.openView(ROODIO_CHAT_VIEW_ID, true);
		}
	}
});

// Add to the global title bar on the RIGHT side
MenuRegistry.appendMenuItem(MenuId.TitleBar, {
	command: {
		id: ROODIO_OPEN_CHAT_ACTION_ID,
		title: localize('roodioChatTitle', "Roo Dio"),
		icon: ROODIO_ICON
	},
	group: 'navigation',
	order: 10002, // After GitHub Copilot chat (which is at 10001)
	when: ContextKeyExpr.has('config.roodio.titleBarIcon.enabled')
});
