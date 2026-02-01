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

		// Handle screenshot requests (bidirectional IPC)
		this._register(this.componentService.onScreenshotRequested(async (event) => {
			console.log(`[Browser] 📸 Screenshot requested from Core`, { requestId: event.requestId, componentId: event.componentId });
			try {
				// Call extension command to capture screenshot
				const screenshot = await this.commandService.executeCommand<string | null>(
					'roopik.canvas.captureComponentScreenshot',
					event.componentId
				);

				// Deliver result back to main process (coalesce undefined to null)
				if (screenshot === null || screenshot === undefined) {
					console.warn(`[Browser] ❌ Extension returned null/undefined for ${event.componentId}`);
					this.componentService.deliverComponentScreenshot(
						event.requestId,
						null,
						'[Browser] Extension command returned null - canvas panel may not be active or component not found'
					);
				} else {
					const preview = screenshot.substring(0, 100);
					console.log(`[Browser] ✅ Screenshot received from extension, delivering to Core`, {
						requestId: event.requestId,
						componentId: event.componentId,
						dataUrlLength: screenshot.length,
						preview
					});
					this.componentService.deliverComponentScreenshot(event.requestId, screenshot);
				}
			} catch (error) {
				console.error(`[Browser] ❌ Error capturing screenshot`, { requestId: event.requestId, componentId: event.componentId, error });
				// Deliver error back to main process
				const errorMessage = error instanceof Error
					? `[Browser] ${error.message}`
					: '[Browser] Screenshot capture command failed';
				this.componentService.deliverComponentScreenshot(event.requestId, null, errorMessage);
			}
		}));
	}
}
