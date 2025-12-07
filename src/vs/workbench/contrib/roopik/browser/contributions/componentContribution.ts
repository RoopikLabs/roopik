/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Component Contribution
 *
 * Bridges ComponentService events to Extension commands.
 * - Routes component created events to extension
 * - Routes component built events to extension
 * - Routes component deleted events to extension
 * - Routes component updated events to extension
 */

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IComponentService } from '../../common/component/componentService.js';

export class RoopikComponentContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'roopik.componentContribution';

	constructor(
		@IComponentService private readonly componentService: IComponentService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super();

		// Route component created events to extension
		this._register(this.componentService.onComponentCreated(async (event) => {
			await this.commandService.executeCommand('roopik.component.created', {
				componentId: event.component.id,
				canvasId: event.component.canvasId,
				component: event.component
			});
		}));

		// Route component built events to extension
		this._register(this.componentService.onComponentBuilt(async (event) => {
			await this.commandService.executeCommand('roopik.component.built', {
				componentId: event.componentId,
				canvasId: event.canvasId,
				success: event.success,
				result: event.result,
				errorInfo: event.errorInfo,
				trigger: event.trigger
			});
		}));

		// Route component deleted events to extension
		this._register(this.componentService.onComponentDeleted(async (event) => {
			await this.commandService.executeCommand('roopik.component.deleted', {
				componentId: event.componentId,
				canvasId: event.canvasId
			});
		}));

		// Route component updated events to extension
		this._register(this.componentService.onComponentUpdated(async (event) => {
			await this.commandService.executeCommand('roopik.component.updated', {
				componentId: event.component.id,
				canvasId: event.component.canvasId,
				component: event.component,
				changes: event.changes
			});
		}));
	}
}
