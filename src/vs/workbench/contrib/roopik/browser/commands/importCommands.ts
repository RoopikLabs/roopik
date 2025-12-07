/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Import Commands
 *
 * Commands for importing components from various sources.
 * - roopik.import.showPicker: Show import source picker (local file, GitHub, Figma, etc.)
 */

import { localize, localize2 } from '../../../../../nls.js';
import { registerAction2, Action2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ICanvasService } from '../../common/canvas/index.js';
import { IComponentService } from '../../common/component/componentService.js';

/**
 * Register all import-related commands
 */
export function registerImportCommands(): void {
	// Import Component - Show source picker
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.import.showPicker',
				title: localize2('roopik.import.showPicker', 'Import Component'),
				category: localize2('roopik.category', 'Roopik'),
				f1: true
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const quickInputService = accessor.get(IQuickInputService);
			const canvasService = accessor.get(ICanvasService);
			const componentService = accessor.get(IComponentService);
			const notificationService = accessor.get(INotificationService);
			const commandService = accessor.get(ICommandService);
			const fileDialogService = accessor.get(IFileDialogService);

			// Get or select target canvas
			let targetCanvasId = await canvasService.getFocusedCanvasIdAsync();

			if (!targetCanvasId) {
				const allCanvases = await canvasService.listCanvasesAsync();

				if (allCanvases.length === 0) {
					const shouldCreate = await quickInputService.pick([
						{ label: '$(add) Create New Canvas', id: 'create' },
						{ label: '$(close) Cancel', id: 'cancel' }
					], {
						title: localize('roopik.import.noCanvas.title', 'No Canvases Found'),
						placeHolder: localize('roopik.import.noCanvas.placeholder', 'Create a canvas first to import components')
					});

					if (shouldCreate?.id === 'create') {
						await commandService.executeCommand('roopik.openCanvas');
					}
					return;
				}

				const canvasItems = [
					...allCanvases.map(canvas => ({
						label: `$(symbol-class) ${canvas.name}`,
						id: canvas.id,
						description: `${canvas.componentCount || 0} components`,
						detail: canvas.description || undefined
					})),
					{ label: '$(add) Create New Canvas', id: 'create', description: '' }
				];

				const selectedCanvas = await quickInputService.pick(canvasItems, {
					title: localize('roopik.import.selectCanvas.title', 'Select Target Canvas'),
					placeHolder: localize('roopik.import.selectCanvas.placeholder', 'Choose a canvas to import the component into')
				});

				if (!selectedCanvas) {
					return;
				}

				if (selectedCanvas.id === 'create') {
					await commandService.executeCommand('roopik.openCanvas');
					return;
				}

				targetCanvasId = selectedCanvas.id;
			}

			const canvasId = targetCanvasId;

			// Show import source picker
			const importSources = [
				{
					label: '$(file-code) Local File',
					id: 'local-file',
					description: 'Import from your project files',
					detail: 'Browse and select a React, Vue, or Svelte component file'
				},
				{
					label: '$(github) GitHub',
					id: 'github',
					description: 'Coming Soon',
					detail: 'Import components from public GitHub repositories'
				},
				{
					label: '$(symbol-color) Figma',
					id: 'figma',
					description: 'Coming Soon',
					detail: 'Convert Figma designs to React components'
				},
				{
					label: '$(package) Third-party Libraries',
					id: 'third-party',
					description: 'Coming Soon',
					detail: 'Import from npm packages like shadcn/ui, Chakra, etc.'
				},
				{
					label: '$(edit) Create Blank Component',
					id: 'manual',
					description: 'Start with a template',
					detail: 'Create a new component from scratch'
				}
			];

			const selectedSource = await quickInputService.pick(importSources, {
				title: localize('roopik.import.title', 'Import Component'),
				placeHolder: localize('roopik.import.placeholder', 'Select an import source')
			});

			if (!selectedSource) {
				return;
			}

			// Handle each source type
			switch (selectedSource.id) {
				case 'local-file':
					await this.handleLocalFileImport(fileDialogService, componentService, notificationService, canvasId);
					break;

				case 'manual':
					await this.handleManualCreate(quickInputService, componentService, notificationService, canvasId);
					break;

				case 'github':
				case 'figma':
				case 'third-party':
					notificationService.info(
						localize('roopik.import.comingSoon', '{0} import is coming soon!', selectedSource.label.replace(/\$\([^)]+\)\s*/, ''))
					);
					break;
			}
		}

		private async handleLocalFileImport(
			fileDialogService: IFileDialogService,
			componentService: IComponentService,
			notificationService: INotificationService,
			canvasId: string
		): Promise<void> {
			const uris = await fileDialogService.showOpenDialog({
				title: localize('roopik.import.localFile.title', 'Select Component File'),
				canSelectFiles: true,
				canSelectFolders: false,
				canSelectMany: false,
				openLabel: localize('roopik.import.localFile.openLabel', 'Import'),
				filters: [
					{ name: localize('roopik.import.filter.all', 'All Components (*.tsx, *.jsx, *.vue, *.svelte, *.ts, *.js)'), extensions: ['tsx', 'jsx', 'vue', 'svelte', 'ts', 'js'] }
				]
			});

			if (!uris || uris.length === 0) {
				return;
			}

			const selectedUri = uris[0];
			const filePath = selectedUri.fsPath;

			try {
				const fileName = filePath.split(/[\\/]/).pop() || 'Component';
				const componentName = fileName.replace(/\.[^/.]+$/, '');

				await componentService.createComponent({
					name: componentName,
					canvasId: canvasId,
					source: 'local-file',
					sourceData: { type: 'local-file', filePath: filePath }
				});

				notificationService.info(
					localize('roopik.import.success', 'Importing component: {0}', componentName)
				);
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				notificationService.error(
					localize('roopik.import.error', 'Failed to import: {0}', errorMsg)
				);
			}
		}

		private async handleManualCreate(
			quickInputService: IQuickInputService,
			componentService: IComponentService,
			notificationService: INotificationService,
			canvasId: string
		): Promise<void> {
			const componentName = await quickInputService.input({
				title: localize('roopik.import.manual.title', 'Create Blank Component'),
				prompt: localize('roopik.import.manual.prompt', 'Enter a name for your component'),
				placeHolder: localize('roopik.import.manual.placeholder', 'e.g., MyComponent'),
				validateInput: async (value: string) => {
					if (!value || !value.trim()) {
						return localize('roopik.import.manual.required', 'Component name is required');
					}
					if (!/^[A-Z][a-zA-Z0-9]*$/.test(value)) {
						return localize('roopik.import.manual.invalidName', 'Use PascalCase (e.g., MyComponent)');
					}
					return undefined;
				}
			});

			if (!componentName) {
				return;
			}

			try {
				await componentService.createComponent({
					name: componentName,
					canvasId: canvasId,
					source: 'manual',
					sourceData: { type: 'manual', framework: 'react', template: 'basic' }
				});

				notificationService.info(
					localize('roopik.import.created', 'Creating component: {0}', componentName)
				);
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				notificationService.error(
					localize('roopik.import.error', 'Failed to create: {0}', errorMsg)
				);
			}
		}
	});
}
