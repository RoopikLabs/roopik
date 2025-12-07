/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Component Commands
 *
 * Commands for component operations, called by Extension to interact with Core.
 * - roopik.core.createComponent: Create a new component
 * - roopik.core.createCanvas: Create a new canvas
 * - roopik.core.rebuildComponent: Rebuild a component
 * - roopik.core.deleteComponent: Delete a component
 * - roopik.core.getBundledCode: Get bundled code for a component
 * - roopik.core.getComponentSource: Get source files for a component
 * - roopik.core.updateComponentSource: Update source files for a component
 */

import { localize2 } from '../../../../../nls.js';
import { registerAction2, Action2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ICanvasService, CreateCanvasResult } from '../../common/canvas/index.js';
import { IComponentService } from '../../common/component/componentService.js';
import { CreateComponentRequest, Component } from '../../common/component/types.js';

/**
 * Register all component-related commands (Extension → Core)
 */
export function registerComponentCommands(): void {

	// ========================================================================
	// Canvas Commands
	// ========================================================================

	// Create Canvas (called by Extension)
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.core.createCanvas',
				title: localize2('roopik.core.createCanvas', 'Create Canvas (Internal)'),
				category: localize2('roopik.category', 'Roopik'),
				f1: false // Internal command
			});
		}

		async run(accessor: ServicesAccessor, name: string): Promise<CreateCanvasResult | undefined> {
			if (!name) {
				console.error('[ComponentCommands] roopik.core.createCanvas: name is required');
				return undefined;
			}
			const canvasService = accessor.get(ICanvasService);
			return canvasService.createCanvas(name);
		}
	});

	// ========================================================================
	// Component Commands
	// ========================================================================

	// Create Component (called by Extension)
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.core.createComponent',
				title: localize2('roopik.core.createComponent', 'Create Component (Internal)'),
				category: localize2('roopik.category', 'Roopik'),
				f1: false // Internal command
			});
		}

		async run(accessor: ServicesAccessor, request: CreateComponentRequest): Promise<Component | undefined> {
			if (!request) {
				console.error('[ComponentCommands] roopik.core.createComponent: request is required');
				return undefined;
			}

			console.log('[ComponentCommands] Creating component:', request.name, 'for canvas:', request.canvasId);

			const componentService = accessor.get(IComponentService);

			try {
				const component = await componentService.createComponent(request);
				console.log('[ComponentCommands] Component created:', component.id);
				return component;
			} catch (err) {
				console.error('[ComponentCommands] Failed to create component:', err);
				throw err;
			}
		}
	});

	// Rebuild Component
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.core.rebuildComponent',
				title: localize2('roopik.core.rebuildComponent', 'Rebuild Component (Internal)'),
				category: localize2('roopik.category', 'Roopik'),
				f1: false
			});
		}

		async run(accessor: ServicesAccessor, componentId: string): Promise<void> {
			if (!componentId) {
				console.error('[ComponentCommands] roopik.core.rebuildComponent: componentId is required');
				return;
			}

			console.log('[ComponentCommands] Rebuilding component:', componentId);

			const componentService = accessor.get(IComponentService);
			await componentService.rebuildComponent(componentId);
		}
	});

	// Delete Component
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.core.deleteComponent',
				title: localize2('roopik.core.deleteComponent', 'Delete Component (Internal)'),
				category: localize2('roopik.category', 'Roopik'),
				f1: false
			});
		}

		async run(accessor: ServicesAccessor, componentId: string): Promise<void> {
			if (!componentId) {
				console.error('[ComponentCommands] roopik.core.deleteComponent: componentId is required');
				return;
			}

			console.log('[ComponentCommands] Deleting component:', componentId);

			const componentService = accessor.get(IComponentService);
			await componentService.deleteComponent(componentId);
		}
	});

	// Get Bundled Code
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.core.getBundledCode',
				title: localize2('roopik.core.getBundledCode', 'Get Bundled Code (Internal)'),
				category: localize2('roopik.category', 'Roopik'),
				f1: false
			});
		}

		async run(accessor: ServicesAccessor, componentId: string): Promise<string | undefined> {
			if (!componentId) {
				console.error('[ComponentCommands] roopik.core.getBundledCode: componentId is required');
				return undefined;
			}

			const componentService = accessor.get(IComponentService);
			return componentService.getBundledCode(componentId);
		}
	});

	// Get Component Source
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.core.getComponentSource',
				title: localize2('roopik.core.getComponentSource', 'Get Component Source (Internal)'),
				category: localize2('roopik.category', 'Roopik'),
				f1: false
			});
		}

		async run(accessor: ServicesAccessor, componentId: string): Promise<Record<string, string> | undefined> {
			if (!componentId) {
				console.error('[ComponentCommands] roopik.core.getComponentSource: componentId is required');
				return undefined;
			}

			const componentService = accessor.get(IComponentService);
			return componentService.getComponentSource(componentId);
		}
	});

	// Update Component Source
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.core.updateComponentSource',
				title: localize2('roopik.core.updateComponentSource', 'Update Component Source (Internal)'),
				category: localize2('roopik.category', 'Roopik'),
				f1: false
			});
		}

		async run(accessor: ServicesAccessor, componentId: string, files: Record<string, string>): Promise<void> {
			if (!componentId) {
				console.error('[ComponentCommands] roopik.core.updateComponentSource: componentId is required');
				return;
			}
			if (!files) {
				console.error('[ComponentCommands] roopik.core.updateComponentSource: files is required');
				return;
			}

			console.log('[ComponentCommands] Updating component source:', componentId);

			const componentService = accessor.get(IComponentService);
			await componentService.updateComponentSource(componentId, files);
		}
	});
}
