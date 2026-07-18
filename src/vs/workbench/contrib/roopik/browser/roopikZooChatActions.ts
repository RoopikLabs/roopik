/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Action2, registerAction2, MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { FileAccess } from '../../../../base/common/network.js';
import { TitleBarLeadingActionsGroup } from '../../../browser/parts/titlebar/titlebarActions.js';

const ROOPIK_ZOO_CATEGORY = localize2('roopik-zoo.category', 'Zoo Code (Roopik)');
const ROOPIK_ZOO_OPEN_CHAT_ACTION_ID = 'workbench.action.roopik-zoo.openChat';
const ROOPIK_ZOO_CHAT_VIEW_ID = 'roopik-zoo.ChatPanel';

// Custom Roopik Zoo chat icon (theme-aware)
const ROOPIK_ZOO_ICON = {
	dark: FileAccess.asBrowserUri('vs/workbench/contrib/roopik/browser/media/roopik-zoo-icon-dark.svg'),
	light: FileAccess.asBrowserUri('vs/workbench/contrib/roopik/browser/media/roopik-zoo-icon-light.svg')
};

// Main action to toggle Roopik Zoo chat panel
registerAction2(class OpenRoopikZooChatAction extends Action2 {
	constructor() {
		super({
			id: ROOPIK_ZOO_OPEN_CHAT_ACTION_ID,
			title: localize2('openRoopikZooChat', "Toggle Zoo Code (Roopik) Chat"),
			category: ROOPIK_ZOO_CATEGORY,
			icon: ROOPIK_ZOO_ICON,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const viewsService = accessor.get(IViewsService);

		// Check if the chat view is currently visible
		const isVisible = viewsService.isViewVisible(ROOPIK_ZOO_CHAT_VIEW_ID);

		if (isVisible) {
			// Hide the auxiliary bar (right sidebar)
			layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		} else {
			// Show the auxiliary bar and focus the chat panel
			layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			await viewsService.openView(ROOPIK_ZOO_CHAT_VIEW_ID, true);
		}
	}
});

MenuRegistry.appendMenuItem(MenuId.TitleBar, {
	command: {
		id: ROOPIK_ZOO_OPEN_CHAT_ACTION_ID,
		title: localize('roopikZooChatTitle', "Zoo Code (Roopik)"),
		icon: ROOPIK_ZOO_ICON
	},
	group: TitleBarLeadingActionsGroup,
	order: -1000,
	when: ContextKeyExpr.has('config.roopik-zoo.titleBarIcon.enabled')
});
