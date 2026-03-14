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
import { getRoopikLogger } from '../../common/roopikLogger.js';
import { ILoggerService } from '../../../../../platform/log/common/log.js';

/**
 * Arguments for openProjectPreview command
 */
interface OpenProjectPreviewArgs {
	projectPath?: string;
	projectName?: string;
}

// Flag to control browser editor behavior:
// - true: Open in split view with locked group (original behavior)
// - false: Open as regular tab in active group
const BROWSER_OPEN_IN_SPLIT_VIEW = false;

/**
 * Helper function to open/focus the browser editor.
 * This centralizes the logic since the browser is a singleton.
 *
 * @returns The opened browser editor pane, or undefined if failed
 */
export async function openBrowserEditor(
	editorService: IEditorService,
	editorGroupsService: IEditorGroupsService,
	configurationService: IConfigurationService
): Promise<ProjectModeEditor | undefined> {
	const input = EditorTabInput.getInstance();

	// Check if browser editor is already open in any group
	const visibleEditors = editorService.visibleEditorPanes;
	const existingPane = visibleEditors.find(
		pane => pane.input instanceof EditorTabInput
	);

	if (existingPane && existingPane instanceof ProjectModeEditor) {
		// Browser already open -> focus it
		await existingPane.group.openEditor(input, { pinned: true });

		if (BROWSER_OPEN_IN_SPLIT_VIEW && editorGroupsService.groups.length > 1) {
			existingPane.group.lock(true);
		}

		return existingPane;
	}

	let targetGroup;
	if (BROWSER_OPEN_IN_SPLIT_VIEW) {
		// Open in a side group (split view)
		const direction = preferredSideBySideGroupDirection(configurationService);
		targetGroup = editorGroupsService.findGroup({ direction });
		if (!targetGroup) {
			targetGroup = editorGroupsService.addGroup(editorGroupsService.activeGroup, direction);
		}
	} else {
		// Open in active group as regular tab
		targetGroup = editorGroupsService.activeGroup;
	}

	await targetGroup.openEditor(input, { pinned: true });

	if (BROWSER_OPEN_IN_SPLIT_VIEW && editorGroupsService.groups.length > 1) {
		targetGroup.lock(true);
	}

	// Find the newly opened editor pane
	const newPane = editorService.visibleEditorPanes.find(
		pane => pane.input instanceof EditorTabInput
	);

	return newPane instanceof ProjectModeEditor ? newPane : undefined;
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
			const commandService = accessor.get(ICommandService);
			const notificationService = accessor.get(INotificationService);
			const storageService = accessor.get(IStorageService);
			const configurationService = accessor.get(IConfigurationService);

			// If projectPath provided, delegate to startProject command
			// This ensures single flow: start server -> event opens browser
			if (args?.projectPath) {
				await commandService.executeCommand('roopik.startProject', {
					projectPath: args.projectPath
				});
				return;
			}

			const browserMode = configurationService.getValue<string>('roopik.browser.mode') || 'embedded';

			if (browserMode === 'external') {
				// External mode: launch Chrome via IPC (no embedded editor tab)
				const mainProcessService = accessor.get(IMainProcessService);
				const channel = mainProcessService.getChannel('roopik.tools');
				const result = await channel.call('browser_open', {});
				if (result && !result.success) {
					notificationService.error(`Failed to open external browser: ${result.error}`);
				} else {
					notificationService.info('External Chrome browser launched.');
				}
				return;
			}

			// Embedded mode: Open browser editor tab
			const editorService = accessor.get(IEditorService);
			const editorGroupsService = accessor.get(IEditorGroupsService);

			// Open/focus browser editor and lock its group (centralized logic)
			await openBrowserEditor(editorService, editorGroupsService, configurationService);

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
				// Flow: Start dev server FIRST -> open browser only on success
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
	// Flow: Start dev server FIRST -> if success -> open browser -> navigate to URL
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
			const notificationService = accessor.get(INotificationService);

			// Validate projectPath
			if (!args?.projectPath) {
				notificationService.error('Project path is required');
				return { url: '', success: false };
			}

			const projectPath = args.projectPath;

			try {
				// ============================================
				// STEP 1: Start dev server FIRST
				// Browser opening is handled by projectModeContribution via event
				// ============================================
				const devServerService = new DevServerBridge(mainProcessService.getChannel(DEV_SERVER_CHANNEL));

				const loggerService = accessor.get(ILoggerService);
				const logger = getRoopikLogger(loggerService, 'BROWSER_COMMANDS');

				// Check if another project is already running (project switching)
				const runningServer = await devServerService.getRunningServer();
				if (runningServer && runningServer.projectRoot !== projectPath) {
					logger.info('Project switching detected - browser will be reused', {
						previous: runningServer.projectRoot,
						next: projectPath
					});
				}

				const url = await devServerService.startServer({
					projectRoot: projectPath,
					port: 5173
				});

				// Browser opening and navigation is handled by projectModeContribution
				// via onStatusChanged event when server becomes 'running'

				notificationService.info(`Project started at: ${url}`);
				return { url, success: true };

			} catch (error) {
				// Server failed to start -> DON'T open browser, show error
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
				const portBefore = statusBefore.wsPort;

				// Show notification that restart is in progress
				notificationService.info('Restarting MCP Server...');

				// Perform restart
				await mcpServerService.restart();

				// Get status after restart
				const statusAfter = await mcpServerService.getStatus();
				const portAfter = statusAfter.wsPort;

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
