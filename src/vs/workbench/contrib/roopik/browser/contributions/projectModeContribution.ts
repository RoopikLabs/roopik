/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Project Mode Contribution
 *
 * Handles automatic browser opening/closing when dev server starts/stops.
 * This creates a universal flow: whenever a dev server starts (from UI, MCP agent, or API),
 * the browser automatically opens and navigates to the server URL.
 * When the server stops, the browser editor is automatically closed.
 *
 * Architecture:
 * - Listens to devServerService.onStatusChanged event
 * - When state becomes 'running', opens browser editor and navigates
 * - When state becomes 'stopped', closes browser editor
 * - Editor already handles checking if browser is open/reusing existing instance
 */

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IEditorGroupsService, preferredSideBySideGroupDirection } from '../../../../services/editor/common/editorGroupsService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { EditorTabInput } from '../projectMode/editorTabInput.js';
import { Editor as ProjectModeEditor } from '../projectMode/editor.js';
import { DevServerBridge } from '../projectMode/devServerBridge.js';
import { DEV_SERVER_CHANNEL } from '../../common/projectMode/devServer.js';

export class RoopikProjectModeContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'roopik.projectModeContribution';

	private devServerService: DevServerBridge;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IMainProcessService mainProcessService: IMainProcessService
	) {
		super();

		// Get DevServerService via IPC
		this.devServerService = new DevServerBridge(mainProcessService.getChannel(DEV_SERVER_CHANNEL));

		// Listen to server status changes
		this.setupDevServerListener();
	}

	/**
	 * Setup listener for dev server status changes
	 * When server becomes 'running', automatically open browser and navigate
	 * When server becomes 'stopped', automatically close browser
	 */
	private setupDevServerListener(): void {
		this._register(this.devServerService.onStatusChanged(async (event) => {
			// Handle server entering 'running' state → open browser
			if (event.state === 'running' && event.url) {
				console.log('[ProjectModeContribution] Dev server started, opening browser:', {
					projectRoot: event.projectRoot,
					url: event.url,
					framework: event.framework
				});

				try {
					await this.openBrowserAndNavigate(event.url, event.projectRoot);
				} catch (error) {
					console.error('[ProjectModeContribution] Failed to open browser:', error);
				}
				return;
			}

			// Handle server entering 'stopped' state → close browser
			if (event.state === 'stopped') {
				console.log('[ProjectModeContribution] Dev server stopped, closing browser:', {
					projectRoot: event.projectRoot
				});

				try {
					await this.closeBrowser();
				} catch (error) {
					console.error('[ProjectModeContribution] Failed to close browser:', error);
				}
			}
		}));
	}

	/**
	 * Open browser editor and navigate to URL
	 * Reuses existing browser if already open, otherwise creates new one
	 */
	private async openBrowserAndNavigate(url: string, projectRoot: string): Promise<void> {
		// Get the singleton browser input
		const input = EditorTabInput.getInstance();

		// Check if browser editor is already open
		const visibleEditors = this.editorService.visibleEditorPanes;
		const existingPane = visibleEditors.find(
			pane => pane.input instanceof EditorTabInput
		);

		if (existingPane && existingPane instanceof ProjectModeEditor) {
			// Browser already open → just navigate to URL
			await existingPane.group.openEditor(input, { pinned: true });
			await existingPane.navigateToUrl(url, projectRoot);
			console.log('[ProjectModeContribution] Reused existing browser, navigated to:', url);
		} else {
			// Browser not open → open it first, then navigate
			const direction = preferredSideBySideGroupDirection(this.configurationService);
			let targetGroup = this.editorGroupsService.findGroup({ direction });
			if (!targetGroup) {
				targetGroup = this.editorGroupsService.addGroup(this.editorGroupsService.activeGroup, direction);
			}
			await targetGroup.openEditor(input, { pinned: true });

			// Find the newly opened editor pane and navigate
			const newPane = this.editorService.visibleEditorPanes.find(
				pane => pane.input instanceof EditorTabInput
			);

			if (newPane && newPane instanceof ProjectModeEditor) {
				await newPane.navigateToUrl(url, projectRoot);
				console.log('[ProjectModeContribution] Opened new browser and navigated to:', url);
			}
		}
	}

	/**
	 * Close browser editor if open
	 */
	private async closeBrowser(): Promise<void> {
		// Find open browser editor panes
		const visibleEditors = this.editorService.visibleEditorPanes;
		const browserPane = visibleEditors.find(
			pane => pane.input instanceof EditorTabInput
		);

		if (browserPane && browserPane.group) {
			// Close the editor in its group
			await browserPane.group.closeEditor(browserPane.input);
			console.log('[ProjectModeContribution] Browser editor closed');
		} else {
			console.log('[ProjectModeContribution] No browser editor to close');
		}
	}
}
