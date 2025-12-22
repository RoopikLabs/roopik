/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Browser Commands
 *
 * Commands for browser preview (Mode 2).
 * - roopik.openProjectPreview: Open browser preview with DevTools
 */

import { localize2 } from '../../../../../nls.js';
import { registerAction2, Action2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IEditorGroupsService, preferredSideBySideGroupDirection } from '../../../../services/editor/common/editorGroupsService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { EditorTabInput } from '../projectMode/editorTabInput.js';
import { Editor as ProjectModeEditor } from '../projectMode/editor.js';
import { DevServerBridge } from '../projectMode/devServerBridge.js';
import { DEV_SERVER_CHANNEL } from '../../common/projectMode/devServer.js';
import { IMcpServerService } from '../../common/mcp/index.js';

/**
 * Arguments for openProjectPreview command
 */
interface OpenProjectPreviewArgs {
	projectPath?: string;
	projectName?: string;
}

/**
 * Register all browser-related commands
 */
export function registerBrowserCommands(): void {
	// Open Browser Project Preview (Mode 2 with embedded DevTools) - SINGLETON
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.openProjectPreview',
				title: localize2('roopik.openProjectPreview', 'Open Browser Preview'),
				category: localize2('roopik.category', 'Roopik'),
				f1: true
			});
		}

		async run(accessor: ServicesAccessor, args?: OpenProjectPreviewArgs): Promise<void> {
			const editorService = accessor.get(IEditorService);
			const editorGroupsService = accessor.get(IEditorGroupsService);
			const configurationService = accessor.get(IConfigurationService);
			const notificationService = accessor.get(INotificationService);
			const storageService = accessor.get(IStorageService);

			// SINGLETON: Get the one and only browser instance
			const input = EditorTabInput.getInstance();

			// Check if browser editor is already open in any group
			const visibleEditors = editorService.visibleEditorPanes;
			let existingPane = visibleEditors.find(
				pane => pane.input instanceof EditorTabInput
			);

			if (existingPane) {
				// Focus existing editor in its current group
				await existingPane.group.openEditor(input, { pinned: true });

				// If projectPath provided, start that project in the existing editor
				if (args?.projectPath && existingPane instanceof ProjectModeEditor) {
					await existingPane.startProjectPreview(args.projectPath);
				}
				return;
			}

			// Open in side group (SIDE_GROUP) by default
			const direction = preferredSideBySideGroupDirection(configurationService);
			let targetGroup = editorGroupsService.findGroup({ direction });
			if (!targetGroup) {
				targetGroup = editorGroupsService.addGroup(editorGroupsService.activeGroup, direction);
			}
			await targetGroup.openEditor(input, { pinned: true });

			// If projectPath provided, start that project after opening
			if (args?.projectPath) {
				// Find the newly opened editor pane
				const newPane = editorService.visibleEditorPanes.find(
					pane => pane.input instanceof EditorTabInput
				);
				if (newPane && newPane instanceof ProjectModeEditor) {
					// Small delay to ensure editor is fully initialized
					await new Promise(resolve => setTimeout(resolve, 100));
					await newPane.startProjectPreview(args.projectPath);
				}
			}

			// Show hint notification (once per installation)
			const hintKey = 'roopik.browserRightSideHintShown';
			const hintShown = storageService.getBoolean(hintKey, StorageScope.APPLICATION, false);

			if (!hintShown) {
				notificationService.notify({
					severity: Severity.Info,
					message: 'Tip: Keep browser on the right side to avoid blocking menu items.',
					sticky: false
				});
				storageService.store(hintKey, true, StorageScope.APPLICATION, 0 /* StorageTarget.USER */);
			}
		}
	});

	// Open Project Picker - Opens file explorer directly, then starts project in browser
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.openProjectPicker',
				title: localize2('roopik.openProjectPicker', 'Open Project'),
				category: localize2('roopik.category', 'Roopik'),
				f1: true
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const nativeHostService = accessor.get(INativeHostService);
			const commandService = accessor.get(ICommandService);
			const notificationService = accessor.get(INotificationService);

			try {
				// Open folder picker dialog
				// Returns { canceled: boolean, filePaths: string[] }
				const result = await nativeHostService.showOpenDialog({
					title: 'Select Project Folder',
					properties: ['openDirectory'],
					buttonLabel: 'Open Project'
				});

				// User cancelled or no selection
				if (!result || result.canceled || result.filePaths.length === 0) {
					return;
				}

				const projectPath = result.filePaths[0];

				// Use the unified startProject command
				// Flow: Start dev server FIRST → open browser only on success
				await commandService.executeCommand('roopik.startProject', {
					projectPath
				});
			} catch (error) {
				notificationService.error(`Failed to open project: ${error}`);
			}
		}
	});

	// ============================================================================
	// UNIFIED PROJECT START COMMAND
	// All entry points (UI buttons, MCP agent) should use this command
	// Flow: Start dev server FIRST → if success → open browser → navigate to URL
	// ============================================================================
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.startProject',
				title: localize2('roopik.startProject', 'Start Project'),
				category: localize2('roopik.category', 'Roopik'),
				f1: true
			});
		}

		async run(accessor: ServicesAccessor, args?: { projectPath: string }): Promise<{ url: string; success: boolean } | undefined> {
			const mainProcessService = accessor.get(IMainProcessService);
			const editorService = accessor.get(IEditorService);
			const editorGroupsService = accessor.get(IEditorGroupsService);
			const configurationService = accessor.get(IConfigurationService);
			const notificationService = accessor.get(INotificationService);

			// Validate projectPath
			if (!args?.projectPath) {
				notificationService.error('Project path is required');
				return { url: '', success: false };
			}

			const projectPath = args.projectPath;
			const projectName = projectPath.split(/[\\/]/).pop() || 'Project';

			// Show starting notification
			notificationService.info(`Starting project: ${projectName}...`);

			try {
				// ============================================
				// STEP 1: Start dev server FIRST
				// ============================================
				const devServerService = new DevServerBridge(mainProcessService.getChannel(DEV_SERVER_CHANNEL));
				const url = await devServerService.startServer({
					projectRoot: projectPath,
					port: 5173
				});

				// ============================================
				// STEP 2: Server started successfully → Open browser
				// ============================================

				// Get the singleton browser input
				const input = EditorTabInput.getInstance();

				// Check if browser editor is already open
				const visibleEditors = editorService.visibleEditorPanes;
				let existingPane = visibleEditors.find(
					pane => pane.input instanceof EditorTabInput
				);

				if (existingPane && existingPane instanceof ProjectModeEditor) {
					// Browser already open → just navigate to URL
					await existingPane.group.openEditor(input, { pinned: true });
					await existingPane.navigateToUrl(url, projectPath);
				} else {
					// Browser not open → open it first, then navigate
					const direction = preferredSideBySideGroupDirection(configurationService);
					let targetGroup = editorGroupsService.findGroup({ direction });
					if (!targetGroup) {
						targetGroup = editorGroupsService.addGroup(editorGroupsService.activeGroup, direction);
					}
					await targetGroup.openEditor(input, { pinned: true });

					// Find the newly opened editor pane and navigate
					const newPane = editorService.visibleEditorPanes.find(
						pane => pane.input instanceof EditorTabInput
					);
					if (newPane && newPane instanceof ProjectModeEditor) {
						// Small delay to ensure editor is fully initialized
						await new Promise(resolve => setTimeout(resolve, 100));
						await newPane.navigateToUrl(url, projectPath);
					}
				}

				notificationService.info(`Project started at: ${url}`);
				return { url, success: true };

			} catch (error) {
				// Server failed to start → DON'T open browser, show error
				const errorMsg = error instanceof Error ? error.message : String(error);
				notificationService.error(`Failed to start project: ${errorMsg}`);
				return { url: '', success: false };
			}
		}
	});

	// Restart MCP Server (for development/troubleshooting)
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.restartMcpServer',
				title: localize2('roopik.restartMcpServer', 'Restart MCP Server'),
				category: localize2('roopik.category', 'Roopik'),
				f1: true
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const notificationService = accessor.get(INotificationService);
			const mcpServerService = accessor.get(IMcpServerService);

			try {
				// Get status before restart
				const statusBefore = await mcpServerService.getStatus();
				const portBefore = statusBefore.port;

				// Show notification that restart is in progress
				notificationService.info('Restarting MCP Server...');

				// Perform restart
				await mcpServerService.restart();

				// Get status after restart
				const statusAfter = await mcpServerService.getStatus();
				const portAfter = statusAfter.port;

				// Show success message
				if (portBefore === portAfter) {
					notificationService.info(`MCP Server restarted successfully on port ${portAfter}`);
				} else {
					notificationService.info(`MCP Server restarted on port ${portAfter} (was ${portBefore})`);
				}
			} catch (error) {
				notificationService.error(`Failed to restart MCP Server: ${error}`);
			}
		}
	});
}
