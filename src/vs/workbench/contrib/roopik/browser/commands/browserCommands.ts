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
import { DEFAULT_MAX_BROWSER_TABS } from '../../common/projectMode/types.js';

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
 * Helper function to open/focus a browser editor tab.
 *
 * Multi-tab behavior:
 * - With tabId: focus existing tab (or create new if not found)
 * - Without tabId and forceNew=false: focus any existing browser tab (first found)
 * - Without tabId and forceNew=true: always create a new tab
 *
 * @returns The opened browser editor pane, or undefined if failed
 */
export async function openBrowserEditor(
	editorService: IEditorService,
	editorGroupsService: IEditorGroupsService,
	configurationService: IConfigurationService,
	options?: { tabId?: number; forceNew?: boolean }
): Promise<ProjectModeEditor | undefined> {
	const { tabId, forceNew } = options || {};

	// If tabId specified, try to focus existing editor for that tab
	// Search ALL editor groups (not just visible panes) to find non-active tabs
	if (tabId !== undefined) {
		const existingInput = EditorTabInput.getByTabId(tabId);
		if (existingInput) {
			for (const group of editorGroupsService.groups) {
				const matchingEditor = group.editors.find(
					editor => editor instanceof EditorTabInput && editor.tabId === tabId
				);
				if (matchingEditor) {
					await group.openEditor(matchingEditor, { pinned: true });
					const pane = editorService.visibleEditorPanes.find(
						p => p.input instanceof EditorTabInput && (p.input as EditorTabInput).tabId === tabId
					);
					return pane instanceof ProjectModeEditor ? pane : undefined;
				}
			}
		}
	}

	// If not forcing new tab, try to focus any existing browser tab
	// Search ALL editor groups to find non-visible browser tabs too
	if (!forceNew) {
		for (const group of editorGroupsService.groups) {
			const browserEditor = group.editors.find(
				editor => editor instanceof EditorTabInput
			);
			if (browserEditor) {
				await group.openEditor(browserEditor, { pinned: true });
				const pane = editorService.visibleEditorPanes.find(
					p => p.input instanceof EditorTabInput
				);
				return pane instanceof ProjectModeEditor ? pane : undefined;
			}
		}
	}

	// Enforce tab limit for embedded mode
	const maxTabs = configurationService.getValue<number>('roopik.browser.maxTabs') || DEFAULT_MAX_BROWSER_TABS;
	const allTabs = EditorTabInput.getAll();
	if (allTabs.length >= maxTabs) {
		// At limit — focus the most recently created tab (last in the list)
		const lastTab = allTabs[allTabs.length - 1];
		if (lastTab) {
			// Find the editor group containing this tab, or use any group with a browser pane
			for (const group of editorGroupsService.groups) {
				for (const editor of group.editors) {
					if (editor instanceof EditorTabInput && editor.tabId === lastTab.tabId) {
						await group.openEditor(editor, { pinned: true });
						// Find the pane
						const pane = editorService.visibleEditorPanes.find(
							p => p.input instanceof EditorTabInput && (p.input as EditorTabInput).tabId === lastTab.tabId
						);
						return pane instanceof ProjectModeEditor ? pane : undefined;
					}
				}
			}
		}
		return undefined;
	}

	// Create a new browser tab with a locally-assigned tabId.
	// The backend uses this same tabId in createBrowserView() to set up tab maps.
	// EditorTabInput.nextLocalTabId() ensures unique IDs across the renderer.
	const newTabId = tabId ?? EditorTabInput.nextLocalTabId();
	const input = new EditorTabInput(newTabId);

	let targetGroup;
	if (BROWSER_OPEN_IN_SPLIT_VIEW) {
		const direction = preferredSideBySideGroupDirection(configurationService);
		targetGroup = editorGroupsService.findGroup({ direction });
		if (!targetGroup) {
			targetGroup = editorGroupsService.addGroup(editorGroupsService.activeGroup, direction);
		}
	} else {
		targetGroup = editorGroupsService.activeGroup;
	}

	await targetGroup.openEditor(input, { pinned: true });

	if (BROWSER_OPEN_IN_SPLIT_VIEW && editorGroupsService.groups.length > 1) {
		targetGroup.lock(true);
	}

	// Find the newly opened editor pane
	const newPane = editorService.visibleEditorPanes.find(
		pane => pane.input instanceof EditorTabInput && (pane.input as EditorTabInput).tabId === newTabId
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
				const result = await channel.call('browser_open', {}) as { success?: boolean; error?: string };
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

			// Check if at tab limit before opening
			const maxTabs = configurationService.getValue<number>('roopik.browser.maxTabs') || DEFAULT_MAX_BROWSER_TABS;
			const atLimit = EditorTabInput.getAll().length >= maxTabs;

			// User clicked "Browse Web" button — open a NEW tab (or focus existing if at limit)
			await openBrowserEditor(editorService, editorGroupsService, configurationService, { forceNew: true });

			if (atLimit) {
				notificationService.warn(
					`Maximum ${maxTabs} browser tabs reached. Close a tab to open a new one, or switch to external browser mode (Settings → Roopik → Browser Mode) for unlimited tabs.`
				);
				return;
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
