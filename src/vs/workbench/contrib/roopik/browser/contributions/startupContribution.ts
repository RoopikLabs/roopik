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
import { RoopikLogger } from '../../common/roopikLogger.js';
import { ICanvasService } from '../../common/canvas/index.js';
import { IComponentService } from '../../common/component/componentService.js';

export class RoopikStartupContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'roopik.startupContribution';

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IStorageService private readonly storageService: IStorageService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IOutputService private readonly outputService: IOutputService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ICanvasService private readonly canvasService: ICanvasService,
		@IComponentService private readonly componentService: IComponentService
	) {
		super();
		this.clearOutputOnStartup();
		this.openWelcomeOnStartup();
		this.initializeRoopikServices();
	}

	/**
	 * Initialize Roopik services with workspace path
	 */
	private async initializeRoopikServices(): Promise<void> {
		await this.lifecycleService.when(LifecyclePhase.Restored);

		const workspace = this.workspaceContextService.getWorkspace();
		if (!workspace.folders || workspace.folders.length === 0) {
			console.warn('[RoopikStartupContribution] No workspace folder found, services not initialized');
			return;
		}

		const workspacePath = workspace.folders[0].uri.fsPath;
		// console.log('[RoopikStartupContribution] Initializing services with workspace:', workspacePath);

		try {
			await this.canvasService.initialize(workspacePath);
			// console.log('[RoopikStartupContribution] CanvasService initialized');

			await this.componentService.initialize(workspacePath);
			// console.log('[RoopikStartupContribution] ComponentService initialized');
		} catch (err) {
			console.error('[RoopikStartupContribution] Failed to initialize services:', err);
		}
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
				const roopikChannel = this.outputService.getChannel(RoopikLogger.LOGGER_ID);
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
