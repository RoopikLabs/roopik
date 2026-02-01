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
 * - Ensure .roopik folder is gitignored (prevents IDE metadata from being committed)
 */

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { ILifecycleService, LifecyclePhase, StartupKind } from '../../../../services/lifecycle/common/lifecycle.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
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
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IOutputService private readonly outputService: IOutputService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
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

			// Ensure .roopik is in .gitignore (non-blocking)
			this.ensureGitignore(workspace.folders[0].uri).catch(err => {
				this.logger.debug('Failed to update .gitignore', { error: err });
			});
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

				// Ensure .roopik is in .gitignore (non-blocking)
				this.ensureGitignore(workspace.folders[0].uri).catch(err => {
					this.logger.debug('Failed to update .gitignore', { error: err });
				});
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
	 * Ensure .roopik folder is in .gitignore
	 * This prevents IDE metadata from being committed to user's git repo
	 * Standard practice used by JetBrains (.idea), VS Code (.vscode in some cases), etc.
	 */
	private async ensureGitignore(workspaceUri: URI): Promise<void> {
		const gitignoreUri = URI.joinPath(workspaceUri, '.gitignore');
		const roopikEntry = '.roopik';

		try {
			// Check if .gitignore exists
			const exists = await this.fileService.exists(gitignoreUri);

			if (exists) {
				// Read existing .gitignore
				const content = await this.fileService.readFile(gitignoreUri);
				const text = content.value.toString();

				// Check if .roopik is already in .gitignore (handle various formats)
				// Match: ".roopik", ".roopik/", ".roopik/*", "/.roopik", etc.
				const lines = text.split(/\r?\n/);
				const alreadyIgnored = lines.some(line => {
					const trimmed = line.trim();
					return trimmed === roopikEntry ||
						trimmed === `${roopikEntry}/` ||
						trimmed === `/${roopikEntry}` ||
						trimmed === `/${roopikEntry}/`;
				});

				if (alreadyIgnored) {
					this.logger.debug('.roopik already in .gitignore');
					return;
				}

				// Append .roopik to .gitignore
				// Ensure proper newline before appending
				const needsNewline = text.length > 0 && !text.endsWith('\n');
				const appendContent = `${needsNewline ? '\n' : ''}\n# Roopik IDE metadata\n${roopikEntry}/\n`;

				await this.fileService.writeFile(
					gitignoreUri,
					VSBuffer.fromString(text + appendContent)
				);
				this.logger.info('Added .roopik to existing .gitignore');
			} else {
				// Create new .gitignore with .roopik entry
				const newContent = `# Roopik IDE metadata\n${roopikEntry}/\n`;
				await this.fileService.writeFile(gitignoreUri, VSBuffer.fromString(newContent));
				this.logger.info('Created .gitignore with .roopik entry');
			}
		} catch (err) {
			// Non-critical error - just log and continue
			this.logger.debug('Could not update .gitignore', { error: err });
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

		// Use configuration setting (roopik.general.showWelcomeOnStartup)
		const showOnStartup = this.configurationService.getValue<boolean>('roopik.general.showWelcomeOnStartup') ?? true;

		if (showOnStartup && this.lifecycleService.startupKind !== StartupKind.ReloadedWindow) {
			if (!this.editorService.activeEditor || this.layoutService.openedDefaultEditors) {
				const welcomeInput = RoopikWelcomeInput.getInstance('welcome');
				await this.editorGroupsService.activeGroup.openEditor(welcomeInput);
			}
		}
	}
}
