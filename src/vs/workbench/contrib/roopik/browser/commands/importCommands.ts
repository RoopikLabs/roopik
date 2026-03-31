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
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { URI } from '../../../../../base/common/uri.js';
import { ICanvasService } from '../../common/canvas/index.js';
import { IComponentService } from '../../common/component/componentService.js';

/** Component file extensions we recognize (Canvas Mode supports these frameworks) */
const COMPONENT_EXTENSIONS = ['.tsx', '.jsx', '.vue', '.svelte'];

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
			const fileService = accessor.get(IFileService);

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
					description: 'Import a single component file',
					detail: 'Select a component file (React, Vue, Svelte, or other supported frameworks)'
				},
				{
					label: '$(folder) Local Folder',
					id: 'local-folder',
					description: 'Import from a folder',
					detail: 'Import all component files in the folder'
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
					await this.handleFileImport(fileDialogService, componentService, notificationService, canvasId);
					break;

				case 'local-folder':
					await this.handleFolderImport(fileDialogService, fileService, quickInputService, componentService, notificationService, canvasId);
					break;

				case 'github':
				case 'figma':
				case 'third-party':
					// Coming soon - no notification needed
					break;
			}
		}

		/**
		 * Handle file picker import (UI-specific)
		 *
		 * Shows file dialog and passes selected path to componentService.
		 * AI agents bypass this and call componentService.addComponent() directly via MCP.
		 */
		private async handleFileImport(
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
					{ name: localize('roopik.import.filter.all', 'Component Files (*.tsx, *.jsx, *.vue, *.svelte)'), extensions: ['tsx', 'jsx', 'vue', 'svelte'] }
				]
			});

			if (!uris || uris.length === 0) {
				return;
			}

			try {
				// Pass selected path to componentService
				// ComponentService handles smart path parsing (file vs folder)
				// and all other logic (entry file detection, framework detection, etc.)
				await componentService.addComponent({
					folderPath: uris[0].fsPath,
					canvasId: canvasId,
					origin: 'local'
				});
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				notificationService.error(localize('roopik.import.error', 'Failed to import: {0}', errorMsg));
			}
		}

		/**
		 * Handle folder import - imports ALL component files as separate components
		 */
		private async handleFolderImport(
			fileDialogService: IFileDialogService,
			fileService: IFileService,
			_quickInputService: IQuickInputService,
			componentService: IComponentService,
			notificationService: INotificationService,
			canvasId: string
		): Promise<void> {
			// 1. Select folder
			const uris = await fileDialogService.showOpenDialog({
				title: localize('roopik.import.localFolder.title', 'Select Component Folder'),
				canSelectFiles: false,
				canSelectFolders: true,
				canSelectMany: false,
				openLabel: localize('roopik.import.localFolder.openLabel', 'Select Folder')
			});

			if (!uris || uris.length === 0) {
				return;
			}

			const folderUri = uris[0];

			// 2. Scan folder for component files (current folder only, not recursive)
			const componentFiles = await this.scanForComponentFiles(fileService, folderUri);

			if (componentFiles.length === 0) {
				notificationService.notify({
					severity: Severity.Warning,
					message: localize('roopik.import.noComponents', 'No component files found in this folder (.tsx, .jsx, .vue, .svelte)')
				});
				return;
			}

			// 3. Import ALL component files as separate components
			let successCount = 0;
			let errorCount = 0;

			for (const file of componentFiles) {
				try {
					await componentService.addComponent({
						folderPath: file.path,
						canvasId: canvasId,
						origin: 'local'
					});
					successCount++;
				} catch {
					errorCount++;
				}
			}

			// 4. Show result
			if (errorCount > 0) {
				notificationService.notify({
					severity: Severity.Warning,
					message: localize('roopik.import.partialSuccess', 'Imported {0} components, {1} failed', successCount, errorCount)
				});
			} else if (successCount > 1) {
				notificationService.notify({
					severity: Severity.Info,
					message: localize('roopik.import.success', 'Successfully imported {0} components', successCount)
				});
			}
			// For single component, no notification needed (standard behavior)
		}

		/**
		 * Scan a folder for component files recursively (up to 3 levels deep)
		 * Only finds .tsx, .jsx, .vue, .svelte files - ignores .ts/.js utility files
		 */
		private async scanForComponentFiles(
			fileService: IFileService,
			folderUri: URI,
			currentDepth: number = 0,
			maxDepth: number = 3
		): Promise<Array<{ name: string; path: string }>> {
			const componentFiles: Array<{ name: string; path: string }> = [];

			// Stop if we've reached max depth
			if (currentDepth > maxDepth) {
				return componentFiles;
			}

			try {
				const stat = await fileService.resolve(folderUri);
				if (stat.children) {
					for (const child of stat.children) {
						if (child.isDirectory) {
							// Recursively scan subdirectories
							const nestedFiles = await this.scanForComponentFiles(
								fileService,
								child.resource,
								currentDepth + 1,
								maxDepth
							);
							componentFiles.push(...nestedFiles);
						} else if (child.name) {
							// Check if file is a component
							const ext = child.name.substring(child.name.lastIndexOf('.')).toLowerCase();
							if (COMPONENT_EXTENSIONS.includes(ext)) {
								componentFiles.push({
									name: child.name,
									path: child.resource.fsPath
								});
							}
						}
					}
				}
			} catch {
				// Folder read error - return what we have
			}

			return componentFiles;
		}
	});
}
