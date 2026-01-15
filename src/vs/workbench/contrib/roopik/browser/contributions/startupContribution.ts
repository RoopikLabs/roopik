/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Startup Contribution
 *
 * Handles Roopik startup tasks:
 * - Open welcome screen on first launch
 * - Clear output channel on fresh startup
 * - Initialize Roopik services
 */

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { ILifecycleService, LifecyclePhase, StartupKind } from '../../../../services/lifecycle/common/lifecycle.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { RoopikWelcomeEditor } from '../welcomeEditor.js';
import { RoopikWelcomeInput } from '../welcomeInput.js';
import { ICanvasService } from '../../common/canvas/index.js';
import { IComponentService } from '../../common/component/componentService.js';
import { IProjectStorageService } from '../../common/projectStorage/index.js';
import { ILoggerService } from '../../../../../platform/log/common/log.js';
import { getRoopikLogger } from '../../common/roopikLogger.js';

export class RoopikStartupContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'roopik.startupContribution';

	private readonly logger;

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IStorageService private readonly storageService: IStorageService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IOutputService private readonly outputService: IOutputService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ICanvasService private readonly canvasService: ICanvasService,
		@IComponentService private readonly componentService: IComponentService,
		@IProjectStorageService private readonly projectStorageService: IProjectStorageService,
		@ILoggerService loggerService: ILoggerService
	) {
		super();
		this.logger = getRoopikLogger(loggerService, 'STARTUP');
		this.clearOutputOnStartup();
		this.openWelcomeOnStartup();
		this.initializeRoopikServices();
		this.listenForWorkspaceChanges();
	}

	/**
	 * Initialize Roopik services with workspace path
	 * If no workspace folder, clear services to remove stale data
	 */
	private async initializeRoopikServices(): Promise<void> {
		await this.lifecycleService.when(LifecyclePhase.Restored);

		const workspace = this.workspaceContextService.getWorkspace();
		if (!workspace.folders || workspace.folders.length === 0) {
			this.logger.info('No workspace folder found, clearing services');
			// Clear services to remove any stale data from previous sessions
			try {
				await this.clearServices();
			} catch (err) {
				this.logger.error('Failed to clear services on startup', { error: err });
			}
			return;
		}

		const workspacePath = workspace.folders[0].uri.fsPath;

		try {
			await this.canvasService.initialize(workspacePath);
			await this.componentService.initialize(workspacePath);
			await this.projectStorageService.initialize(workspacePath);
		} catch (err) {
			this.logger.error('Failed to initialize services', { error: err });
		}
	}

	/**
	 * Listen for workspace folder changes and re-initialize services
	 * This ensures canvas/project lists update when switching workspaces
	 */
	private listenForWorkspaceChanges(): void {
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(async (e) => {
			const workspace = this.workspaceContextService.getWorkspace();

			// If no folders, clear all services (workspace closed)
			if (!workspace.folders || workspace.folders.length === 0) {
				// this.logger.info('Workspace closed, clearing services');
				try {
					await this.clearServices();
				} catch (err) {
					this.logger.error('Failed to clear services', { error: err });
				}
				return;
			}

			const newWorkspacePath = workspace.folders[0].uri.fsPath;
			// this.logger.info('Workspace changed, re-initializing services', { workspacePath: newWorkspacePath });

			try {
				// Re-initialize all services with the new workspace path
				await this.canvasService.initialize(newWorkspacePath);
				await this.componentService.initialize(newWorkspacePath);
				await this.projectStorageService.initialize(newWorkspacePath);
			} catch (err) {
				this.logger.error('Failed to re-initialize services on workspace change', { error: err });
			}
		}));
	}

	/**
	 * Clear all Roopik services (when workspace is closed)
	 */
	private async clearServices(): Promise<void> {
		await this.canvasService.clear();
		await this.componentService.clear();
		await this.projectStorageService.clear();
	}

	/**
	 * Clear Roopik output channel on fresh startup (not on reload)
	 */
	private clearOutputOnStartup(): void {
		if (this.lifecycleService.startupKind === StartupKind.ReloadedWindow) {
			return;
		}

		this.lifecycleService.when(LifecyclePhase.Restored).then(() => {
			setTimeout(() => {
				const roopikChannel = this.outputService.getChannel('roopik');
				if (roopikChannel) {
					roopikChannel.clear();
				}
			}, 100);
		});
	}

	/**
	 * Open welcome screen on fresh startup
	 */
	private async openWelcomeOnStartup(): Promise<void> {
		await this.lifecycleService.when(LifecyclePhase.Restored);

		const showOnStartup = this.storageService.getBoolean(RoopikWelcomeEditor.STORAGE_KEY, StorageScope.PROFILE, true);

		if (showOnStartup && this.lifecycleService.startupKind !== StartupKind.ReloadedWindow) {
			if (!this.editorService.activeEditor || this.layoutService.openedDefaultEditors) {
				const welcomeInput = RoopikWelcomeInput.getInstance('welcome');
				await this.editorGroupsService.activeGroup.openEditor(welcomeInput);
			}
		}
	}
}
