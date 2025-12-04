/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Import Commands
 *
 * Exposes import functionality via commands.
 * Called from Activity Pane's Import button.
 */

import { localize, localize2 } from '../../../../../nls.js';
import { registerAction2, Action2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../../base/common/uri.js';

/**
 * Canvas metadata from .roopik/canvases.json
 */
interface CanvasMetadata {
	id: string;
	name: string;
	folderPath: string;
	createdAt: number;
	updatedAt: number;
}

/**
 * Get available canvases from workspace
 */
async function getAvailableCanvases(
	fileService: IFileService,
	workspaceContextService: IWorkspaceContextService
): Promise<CanvasMetadata[]> {
	const workspace = workspaceContextService.getWorkspace();
	if (!workspace.folders || workspace.folders.length === 0) {
		return [];
	}

	const workspaceFolder = workspace.folders[0];
	const canvasesJsonUri = URI.joinPath(workspaceFolder.uri, '.roopik', 'canvases.json');

	try {
		const content = await fileService.readFile(canvasesJsonUri);
		const data = JSON.parse(content.value.toString()) as { canvases: CanvasMetadata[] };
		return data.canvases || [];
	} catch {
		return [];
	}
}

/**
 * Import source options for the picker
 */
interface ImportSourceItem extends IQuickPickItem {
	id: 'local' | 'github' | 'figma' | 'library';
}

/**
 * Import Component - Shows source picker, then opens appropriate import flow
 */
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'roopik.import.showPicker',
			title: localize2('roopik.import.showPicker', 'Import Component'),
			category: localize2('roopik.category', 'Roopik'),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor, canvasId?: string): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);
		const commandService = accessor.get(ICommandService);

		// Show source picker
		const sources: ImportSourceItem[] = [
			{
				id: 'local',
				label: '$(file-code) Local File',
				description: 'Import from your computer',
				detail: 'Select a .tsx, .jsx, .vue, or .svelte file'
			},
			{
				id: 'github',
				label: '$(github) GitHub',
				description: 'Import from GitHub repository',
				detail: 'Coming soon...'
			},
			{
				id: 'figma',
				label: '$(paintcan) Figma',
				description: 'Import from Figma design',
				detail: 'Coming soon...'
			},
			{
				id: 'library',
				label: '$(library) UI Library',
				description: 'Browse component libraries',
				detail: 'MaterialUI, Ant Design, Chakra UI - Coming soon...'
			}
		];

		const selected = await quickInputService.pick(sources, {
			title: localize('roopik.import.title', 'Import Component'),
			placeHolder: localize('roopik.import.placeholder', 'Choose import source')
		});

		if (!selected) {
			return; // User cancelled
		}

		switch (selected.id) {
			case 'local':
				await commandService.executeCommand('roopik.import.fromLocalFile', canvasId);
				break;

			case 'github':
				notificationService.info('GitHub import coming soon!');
				break;

			case 'figma':
				notificationService.info('Figma import coming soon!');
				break;

			case 'library':
				notificationService.info('UI Library browser coming soon!');
				break;
		}
	}
});

/**
 * Import from Local File - Opens file picker and imports selected file
 */
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'roopik.import.fromLocalFile',
			title: localize2('roopik.import.fromLocalFile', 'Import from Local File'),
			category: localize2('roopik.category', 'Roopik'),
			f1: false // Internal command
		});
	}

	async run(accessor: ServicesAccessor, canvasId?: string): Promise<void> {
		const fileDialogService = accessor.get(IFileDialogService);
		const notificationService = accessor.get(INotificationService);
		const commandService = accessor.get(ICommandService);
		const quickInputService = accessor.get(IQuickInputService);
		const fileService = accessor.get(IFileService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);

		let targetCanvasId = canvasId;

		// If no canvasId provided, prompt user to select or create a canvas
		if (!targetCanvasId) {
			const canvases = await getAvailableCanvases(fileService, workspaceContextService);

			if (canvases.length === 0) {
				// No canvases exist - ask if user wants to create one
				const createNew = await quickInputService.pick(
					[
						{ label: '$(add) Create New Canvas', id: 'create' },
						{ label: '$(close) Cancel', id: 'cancel' }
					],
					{
						title: localize('roopik.import.noCanvas', 'No Canvas Found'),
						placeHolder: localize('roopik.import.noCanvasPlaceholder', 'Create a canvas to import components into')
					}
				);

				if (!createNew || createNew.id === 'cancel') {
					return;
				}

				// Open canvas command which will prompt for name
				await commandService.executeCommand('roopik.openCanvas');
				notificationService.info('Please try importing again after the canvas is created.');
				return;
			}

			// Show canvas picker
			const canvasItems = canvases.map(c => ({
				label: c.name,
				description: `Updated ${formatTimeAgo(c.updatedAt)}`,
				id: c.name
			}));

			// Add option to create new canvas
			canvasItems.push({
				label: '$(add) Create New Canvas',
				description: '',
				id: '__create_new__'
			});

			const selected = await quickInputService.pick(canvasItems, {
				title: localize('roopik.import.selectCanvas', 'Select Canvas'),
				placeHolder: localize('roopik.import.selectCanvasPlaceholder', 'Choose a canvas to import the component into')
			});

			if (!selected) {
				return;
			}

			if (selected.id === '__create_new__') {
				await commandService.executeCommand('roopik.openCanvas');
				notificationService.info('Please try importing again after the canvas is created.');
				return;
			}

			targetCanvasId = selected.id;

			// Open the selected canvas if not already open
			await commandService.executeCommand('roopik.canvas.open', targetCanvasId);
		}

		// Open file picker with filters
		const result = await fileDialogService.showOpenDialog({
			title: localize('roopik.import.filePickerTitle', 'Select Component File'),
			canSelectMany: false,
			canSelectFolders: false,
			filters: [
				{
					name: 'Components',
					extensions: ['tsx', 'jsx', 'vue', 'svelte']
				}
			]
		});

		if (!result || result.length === 0) {
			return; // User cancelled
		}

		const filePath = result[0].fsPath;

		try {
			// Call the import service via command
			const importResult = await commandService.executeCommand('roopik.import.processFile', {
				path: filePath,
				canvasId: targetCanvasId
			});

			if (importResult && (importResult as { success: boolean }).success) {
				notificationService.info(`Component imported successfully!`);
			}
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			notificationService.error(`Import failed: ${errorMsg}`);
		}
	}
});

/**
 * Format timestamp to relative time
 */
function formatTimeAgo(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) {
		return days === 1 ? '1 day ago' : `${days} days ago`;
	}
	if (hours > 0) {
		return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
	}
	if (minutes > 0) {
		return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
	}
	return 'Just now';
}

/**
 * Process file import - Called by extension or internal commands
 * This command interfaces with the ImportService in main process
 */
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'roopik.import.processFile',
			title: localize2('roopik.import.processFile', 'Process File Import'),
			category: localize2('roopik.category', 'Roopik'),
			f1: false // Internal command
		});
	}

	async run(
		accessor: ServicesAccessor,
		request: { path: string; canvasId: string; position?: { x: number; y: number } }
	): Promise<{ success: boolean; error?: string; componentInput?: unknown }> {
		// This will be connected to the ImportService via IPC
		// For now, return the request for the extension to handle
		const commandService = accessor.get(ICommandService);

		// Forward to extension which has access to filesystem
		// The extension will call the sandbox pipeline after processing
		try {
			const result = await commandService.executeCommand('roopik.canvas.importComponent', request);
			return result as { success: boolean; error?: string; componentInput?: unknown };
		} catch (err) {
			return {
				success: false,
				error: err instanceof Error ? err.message : String(err)
			};
		}
	}
});
