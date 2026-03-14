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
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { EditorTabInput } from '../projectMode/editorTabInput.js';
import { DevServerBridge } from '../projectMode/devServerBridge.js';
import { ServiceBridge } from '../projectMode/serviceBridge.js';
import { DEV_SERVER_CHANNEL } from '../../common/projectMode/devServer.js';
import { PROJECT_MODE_CHANNEL } from '../../common/projectMode/ipc.js';
import { openBrowserEditor } from '../commands/browserCommands.js';
import { ILoggerService } from '../../../../../platform/log/common/log.js';
import { getRoopikLogger } from '../../common/roopikLogger.js';

export class RoopikProjectModeContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'roopik.projectModeContribution';

	private devServerService: DevServerBridge;
	private projectModeService: ServiceBridge | null = null;
	private readonly mainProcessService: IMainProcessService;
	private readonly logger;
	private readonly isExternalMode: boolean;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IMainProcessService mainProcessService: IMainProcessService,
		@ILoggerService loggerService: ILoggerService
	) {
		super();
		this.logger = getRoopikLogger(loggerService, 'PROJECT_MODE_CONTRIBUTION');
		this.mainProcessService = mainProcessService;
		this.isExternalMode = (configurationService.getValue<string>('roopik.browser.mode') || 'embedded') === 'external';

		// Get DevServerService via IPC
		this.devServerService = new DevServerBridge(mainProcessService.getChannel(DEV_SERVER_CHANNEL));

		// Listen to server status changes
		this.setupDevServerListener();

		// ProjectModeChannel only exists in embedded mode
		if (!this.isExternalMode) {
			// Get ProjectModeService via IPC (for MCP browser open events)
			this.projectModeService = new ServiceBridge(mainProcessService.getChannel(PROJECT_MODE_CHANNEL));

			// Listen for MCP browser open requests
			this.setupMcpBrowserOpenListener();

			// Listen for MCP browser close requests
			this.setupMcpBrowserCloseListener();
		}
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
				this.logger.info('Dev server started, opening browser', {
					projectRoot: event.projectRoot,
					url: event.url,
					framework: event.framework
				});

				// NOTE: Project saving (upsertProject + setActiveProject) is handled
				// in DevServerService.updateActiveProjectStorage() - main process unified flow

				try {
					await this.openBrowserAndNavigate(event.url, event.projectRoot);
				} catch (error) {
					this.logger.error('Failed to open browser', { error });
				}
				return;
			}

			// Handle server entering 'stopped' state
			if (event.state === 'stopped') {
				this.logger.info('Dev server stopped', { projectRoot: event.projectRoot });

				// Check if browser is already open
				const browserPane = this.editorService.visibleEditorPanes.find(
					pane => pane.input instanceof EditorTabInput
				);

				// If browser is open, it's likely a project switch - keep browser open for reuse
				// The next 'running' event will navigate to the new project URL
				if (browserPane) {
					this.logger.info('Browser is open - keeping it open (project switch detected)');
					return;
				}

				// Browser not open - explicit user stop or cleanup, close browser if somehow still exists
				try {
					await this.closeBrowser();
				} catch (error) {
					this.logger.error('Failed to close browser', { error });
				}
			}
		}));
	}

	/**
	 * Setup listener for MCP browser open requests
	 * When MCP tool browser_open is called and no browser is open,
	 * this opens the browser editor with proper UI
	 */
	private setupMcpBrowserOpenListener(): void {
		this._register(this.projectModeService!.onMcpBrowserOpenRequest(async (event) => {
			// Same as roopik.openProjectPreview command (Browse Web button)
			await this.openBrowserAndNavigate(event.url || '', '');
		}));
	}

	/**
	 * Setup listener for MCP browser close requests
	 * When MCP tool browser_close is called, this closes the editor tab properly
	 * This triggers the full cleanup chain (EditorTabInput.dispose -> destroyBrowserNow -> etc.)
	 */
	private setupMcpBrowserCloseListener(): void {
		this._register(this.projectModeService!.onMcpBrowserCloseRequest(async () => {
			this.logger.info('MCP browser close request received');
			await this.closeBrowser();
		}));
	}

	/**
	 * Open browser and navigate to URL
	 * In embedded mode: opens editor tab and navigates
	 * In external mode: launches Chrome via IPC and navigates
	 */
	private async openBrowserAndNavigate(url: string, projectRoot: string): Promise<void> {
		if (this.isExternalMode) {
			// External mode: launch/navigate Chrome via tools channel IPC
			const channel = this.mainProcessService.getChannel('roopik.tools');
			await channel.call('browser_open', { url });
			this.logger.info('External browser opened/navigated', { url });
			return;
		}

		// Embedded mode: open editor tab and navigate
		const browserPane = await openBrowserEditor(
			this.editorService,
			this.editorGroupsService,
			this.configurationService
		);

		// Navigate to the dev server URL
		if (browserPane) {
			await browserPane.navigateToUrl(url, projectRoot);
			this.logger.info('Browser navigated to URL', { url });
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
			this.logger.info('Browser editor closed');
		} else {
			this.logger.debug('No browser editor to close');
		}
	}
}
