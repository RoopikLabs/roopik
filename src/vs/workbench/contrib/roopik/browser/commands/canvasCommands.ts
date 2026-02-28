/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Canvas Commands
 *
 * Commands for canvas operations and panel state management.
 * - roopik.openCanvas: Create/open a canvas
 * - roopik.core.registerPanelOpen: Register panel opened (internal)
 * - roopik.core.registerPanelClosed: Register panel closed (internal)
 * - roopik.core.registerPanelFocused: Register panel focused (internal)
 */

import { localize, localize2 } from '../../../../../nls.js';
import { registerAction2, Action2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ICanvasService } from '../../common/canvas/index.js';

/**
 * Register all canvas-related commands
 */
export function registerCanvasCommands(): void {
	// Open Canvas (Mode 1: Component Canvas)
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.openCanvas',
				title: localize2('roopik.openCanvas', 'Open Component Canvas'),
				category: localize2('roopik.category', 'Roopik'),
				f1: true
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const quickInputService = accessor.get(IQuickInputService);
			const canvasService = accessor.get(ICanvasService);
			const notificationService = accessor.get(INotificationService);

			// Prompt for canvas name
			const canvasName = await quickInputService.input({
				title: localize('roopik.canvasName.title', 'New Canvas'),
				prompt: localize('roopik.canvasName.prompt', 'Enter a name for your canvas'),
				placeHolder: localize('roopik.canvasName.placeholder', 'e.g., Dashboard Components, Landing Page, etc.'),
				validateInput: async (value: string) => {
					if (!value || !value.trim()) {
						return localize('roopik.canvasName.required', 'Canvas name is required');
					}
					const invalidChars = /[<>:"/\\|?*]/;
					if (invalidChars.test(value)) {
						return localize('roopik.canvasName.invalidChars', 'Canvas name cannot contain: < > : " / \\ | ? *');
					}
					return undefined;
				}
			});

			if (!canvasName) {
				return;
			}

			try {
				const result = await canvasService.createCanvas(canvasName);

				if (!result.isNew) {
					notificationService.info(
						localize('roopik.canvas.exists', 'Opening existing canvas: {0}', result.canvas.name)
					);
				}
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				notificationService.error(
					localize('roopik.canvas.createError', 'Failed to create canvas: {0}', errorMsg)
				);
			}
		}
	});

	// Panel State Commands (internal, called by Extension to notify Core)

	// Extension notifies Core when a canvas panel is opened
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.core.registerPanelOpen',
				title: localize2('roopik.core.registerPanelOpen', 'Register Panel Open'),
				category: localize2('roopik.category', 'Roopik'),
				f1: false // Internal command
			});
		}

		async run(accessor: ServicesAccessor, canvasId: string): Promise<void> {
			if (!canvasId) {
				return;
			}
			const canvasService = accessor.get(ICanvasService);
			canvasService.registerPanelOpen(canvasId);
		}
	});

	// Extension notifies Core when a canvas panel is closed
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.core.registerPanelClosed',
				title: localize2('roopik.core.registerPanelClosed', 'Register Panel Closed'),
				category: localize2('roopik.category', 'Roopik'),
				f1: false
			});
		}

		async run(accessor: ServicesAccessor, canvasId: string): Promise<void> {
			if (!canvasId) {
				return;
			}
			const canvasService = accessor.get(ICanvasService);
			canvasService.registerPanelClosed(canvasId);
		}
	});

	// Extension notifies Core when a canvas panel gains focus
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.core.registerPanelFocused',
				title: localize2('roopik.core.registerPanelFocused', 'Register Panel Focused'),
				category: localize2('roopik.category', 'Roopik'),
				f1: false
			});
		}

		async run(accessor: ServicesAccessor, canvasId: string): Promise<void> {
			if (!canvasId) {
				return;
			}
			const canvasService = accessor.get(ICanvasService);
			canvasService.registerPanelFocused(canvasId);
		}
	});
}
