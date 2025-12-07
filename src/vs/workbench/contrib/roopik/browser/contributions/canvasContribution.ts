/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Canvas Contribution
 *
 * Bridges CanvasService events to Extension commands.
 * - Opens panel when canvas is created
 * - Closes panel when canvas is deleted
 * - Updates panel title when canvas is renamed
 */

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ICanvasService } from '../../common/canvas/index.js';

export class RoopikCanvasContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'roopik.canvasContribution';

	constructor(
		@ICanvasService private readonly canvasService: ICanvasService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super();

		// Open panel when canvas is created (or existing canvas requested)
		this._register(this.canvasService.onCanvasCreated(async (event) => {
			await this.commandService.executeCommand('roopik.canvas.open', {
				canvasId: event.canvasId,
				canvasName: event.canvas.name
			});
		}));

		// Close panel when canvas is deleted
		this._register(this.canvasService.onCanvasDeleted(async (event) => {
			await this.commandService.executeCommand('roopik.canvas.close', event.canvasId);
		}));

		// Update panel title when canvas is renamed
		this._register(this.canvasService.onCanvasUpdated(async (event) => {
			if (event.changes.includes('name')) {
				await this.commandService.executeCommand('roopik.canvas.update', {
					canvasId: event.canvasId,
					canvasName: event.canvas.name
				});
			}
		}));
	}
}
