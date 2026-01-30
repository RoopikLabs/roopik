/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IViewsRegistry, IViewDescriptor, Extensions, ViewContainer, IViewContainersRegistry, ViewContainerLocation, IViewDescriptorService } from '../../../common/views.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { KeyMod, KeyCode } from '../../../../base/common/keyCodes.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { Action } from '../../../../base/common/actions.js';
import { ICanvasService } from '../common/canvas/index.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import type { CanvasMeta } from '../common/canvas/types.js';
import { IProjectStorageService } from '../common/projectStorage/index.js';
import type { ProjectInfo } from '../common/storage/storageTypes.js';
import { IMcpServerService } from '../common/mcp/index.js';

const roopikViewIcon = registerIcon('roopik-view-icon', Codicon.paintcan, localize('roopikViewIcon', 'View icon of the Roopik view.'));

export const ROOPIK_VIEWLET_ID = 'workbench.view.roopik';
export const ROOPIK_VIEW_ID = 'roopik.dashboardView';

/**
 * Roopik Dashboard View
 * Shows canvases and projects in a tree structure
 */
import { getRoopikLogger } from '../common/roopikLogger.js';
import { ILoggerService, ILogService } from '../../../../platform/log/common/log.js';

export class RoopikDashboardView extends ViewPane {
	static readonly ID = ROOPIK_VIEW_ID;
	static readonly NAME = localize2('roopikDashboard', "Dashboard");

	private canvasesContainer: HTMLElement | undefined;
	private projectsContainer: HTMLElement | undefined;
	private mcpButton: HTMLButtonElement | undefined;
	private static animationsInjected = false;

	/** Timeout handle for canvas loading state */
	private loadingTimeoutHandle: ReturnType<typeof setTimeout> | undefined;

	/** Timeout handle for project loading state */
	private projectLoadingTimeoutHandle: ReturnType<typeof setTimeout> | undefined;

	/** Whether we've received the canvas initialization event */
	private serviceInitialized: boolean = false;

	/** Whether we've received the project storage initialization event */
	private projectServiceInitialized: boolean = false;

	/** Loading timeout in milliseconds (5 seconds) */
	private static readonly LOADING_TIMEOUT_MS = 5000;

	private readonly logger;

	constructor(
		options: { id: string; title: string },
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@ICommandService private readonly commandService: ICommandService,
		@INotificationService private readonly notificationService: INotificationService,
		@ICanvasService private readonly canvasService: ICanvasService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IProjectStorageService private readonly projectStorageService: IProjectStorageService,
		@ILoggerService loggerService: ILoggerService,
		@IMcpServerService private readonly mcpServerService: IMcpServerService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
		this.logger = getRoopikLogger(loggerService, 'ROOPIK_DASHBOARD_VIEW');

		// Subscribe to onDidInitialize - this fires when CanvasService is fully ready
		// This is the ONLY trigger for loading canvases - no premature attempts!
		this._register(this.canvasService.onDidInitialize(() => {
			// Service ready - load canvases
			this.serviceInitialized = true;
			this.clearLoadingTimeout();
			this.loadCanvasesNow();
		}));

		// Subscribe to canvas events to auto-refresh the list
		this._register(this.canvasService.onCanvasCreated((event) => {
			// Canvas created - reload list
			this.loadCanvasesNow();
		}));
		this._register(this.canvasService.onCanvasDeleted((event) => {
			// Canvas deleted - reload list
			this.loadCanvasesNow();
		}));
		this._register(this.canvasService.onCanvasUpdated((event) => {
			// Canvas updated - reload list
			this.loadCanvasesNow();
		}));

		// Subscribe to project storage events to auto-refresh projects list
		this._register(this.projectStorageService.onDidInitialize(() => {
			this.projectServiceInitialized = true;
			this.clearProjectLoadingTimeout();
			this.loadProjectsNow();
		}));
		this._register(this.projectStorageService.onProjectsChanged(() => {
			this.loadProjectsNow();
		}));

		// Subscribe to MCP status changes to update toggle buttons
		this._register(this.mcpServerService.onStatusChanged(() => {
			this.updateMcpButtonStates();
		}));
	}

	/**
	 * Clear the canvas loading timeout if it exists
	 */
	private clearLoadingTimeout(): void {
		if (this.loadingTimeoutHandle) {
			clearTimeout(this.loadingTimeoutHandle);
			this.loadingTimeoutHandle = undefined;
		}
	}

	/**
	 * Clear the project loading timeout if it exists
	 */
	private clearProjectLoadingTimeout(): void {
		if (this.projectLoadingTimeoutHandle) {
			clearTimeout(this.projectLoadingTimeoutHandle);
			this.projectLoadingTimeoutHandle = undefined;
		}
	}

	/**
	 * Start canvas loading timeout - shows error state if onDidInitialize never fires
	 */
	private startLoadingTimeout(): void {
		this.clearLoadingTimeout();
		this.loadingTimeoutHandle = setTimeout(() => {
			if (!this.serviceInitialized) {
				// Timeout - show error state
				this.showTimeoutState();
			}
		}, RoopikDashboardView.LOADING_TIMEOUT_MS);
	}

	/**
	 * Start project loading timeout - shows error state if onDidInitialize never fires
	 */
	private startProjectLoadingTimeout(): void {
		this.clearProjectLoadingTimeout();
		this.projectLoadingTimeoutHandle = setTimeout(() => {
			if (!this.projectServiceInitialized) {
				// Timeout - show error state
				this.showProjectTimeoutState();
			}
		}, RoopikDashboardView.LOADING_TIMEOUT_MS);
	}

	/**
	 * Show timeout/error state when canvas initialization takes too long
	 */
	private showTimeoutState(): void {
		if (!this.canvasesContainer) {
			return;
		}

		while (this.canvasesContainer.firstChild) {
			this.canvasesContainer.removeChild(this.canvasesContainer.firstChild);
		}

		this.createSection(this.canvasesContainer, 'Canvases', [
			{
				label: 'Service unavailable',
				description: 'Click to retry',
				onClick: () => {
					this.showLoadingState();
					this.startLoadingTimeout();
				}
			}
		]);
	}

	/**
	 * Show timeout/error state when project initialization takes too long
	 */
	private showProjectTimeoutState(): void {
		if (!this.projectsContainer) {
			return;
		}

		while (this.projectsContainer.firstChild) {
			this.projectsContainer.removeChild(this.projectsContainer.firstChild);
		}

		this.createSection(this.projectsContainer, 'Projects', [
			{
				label: 'Service unavailable',
				description: 'Open a workspace first',
				onClick: () => { }
			}
		]);
	}

	/**
	 * Check if service is already initialized and load canvases
	 * This handles the IDE reload case where onDidInitialize already fired
	 */
	private async checkAndLoadCanvases(): Promise<void> {
		// this.logger.debug('Checking if CanvasService is already initialized...');
		try {
			const isInitialized = await this.canvasService.isInitializedAsync();
			// this.logger.debug('CanvasService isInitialized =', { isInitialized });
			if (isInitialized) {
				// this.logger.debug('Service already initialized, loading canvases now');
				this.serviceInitialized = true;
				this.clearLoadingTimeout();
				this.loadCanvasesNow();
			} else {
				// this.logger.debug('Service not initialized yet, waiting for event...');
				this.startLoadingTimeout();
			}
		} catch (err) {
			this.logger.error('Error checking CanvasService initialization', err);
			this.startLoadingTimeout();
		}
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		// Inject CSS for professional animations
		this.injectDeleteAnimations();

		// Clear existing content to prevent duplicates on re-render
		while (container.firstChild) {
			container.removeChild(container.firstChild);
		}

		container.style.padding = '8px';
		container.style.display = 'flex';
		container.style.flexDirection = 'column';
		container.style.gap = '8px';

		// Top action bar container
		const actionsContainer = document.createElement('div');
		actionsContainer.style.display = 'flex';
		actionsContainer.style.flexDirection = 'column';
		actionsContainer.style.gap = '6px';
		actionsContainer.style.marginBottom = '8px';

		// First row: Mode buttons (Canvas and Project) - larger icons
		const modeButtonsRow = document.createElement('div');
		modeButtonsRow.style.display = 'flex';
		modeButtonsRow.style.alignItems = 'center';
		modeButtonsRow.style.gap = '4px';
		modeButtonsRow.style.flexWrap = 'wrap'; // Allow wrapping when space is limited
		modeButtonsRow.style.minWidth = '0'; // Ensure flex children respect min-width

		const newCanvasBtn = this.createPrimaryActionButton('Canvas', 'codicon-new-file', 'roopik.openCanvas', true, true);
		// Project button opens file explorer directly (folder icon)
		const projectModeBtn = this.createSecondaryActionButton('Project', 'codicon-folder', 'roopik.openProjectPicker', true, true);

		modeButtonsRow.appendChild(newCanvasBtn);
		modeButtonsRow.appendChild(projectModeBtn);

		// Separator line between mode buttons and import
		const separator = document.createElement('div');
		separator.style.width = '100%';
		separator.style.height = '1px';
		separator.style.background = 'var(--vscode-sideBarSectionHeader-border, rgba(148, 163, 184, 0.35))';
		separator.style.margin = '4px 0';

		// Second row: Import and Browse
		const importButtonsRow = document.createElement('div');
		importButtonsRow.style.display = 'flex';
		importButtonsRow.style.alignItems = 'center';
		importButtonsRow.style.gap = '4px';
		importButtonsRow.style.flexWrap = 'wrap'; // Allow buttons to wrap down on narrow screens
		importButtonsRow.style.minWidth = '0'; // Ensure flex children respect min-width

		const importBtn = this.createSecondaryActionButton('Import', 'codicon-cloud-download', 'roopik.import.showPicker', true, false);
		// Browse button opens browser preview with default welcome screen (globe icon)
		const browseBtn = this.createSecondaryActionButton('Browse', 'codicon-globe', 'roopik.openProjectPreview', true, false);

		importButtonsRow.appendChild(importBtn);
		importButtonsRow.appendChild(browseBtn);

		// Third row: MCP toggle button
		const mcpRow = document.createElement('div');
		mcpRow.style.display = 'flex';
		mcpRow.style.alignItems = 'center';
		mcpRow.style.gap = '6px';
		mcpRow.style.marginTop = '4px';

		this.mcpButton = this.createMcpButton();
		mcpRow.appendChild(this.mcpButton);

		actionsContainer.appendChild(modeButtonsRow);
		actionsContainer.appendChild(separator);
		actionsContainer.appendChild(importButtonsRow);
		actionsContainer.appendChild(mcpRow);

		container.appendChild(actionsContainer);

		// Canvases Section (will be populated dynamically)
		this.canvasesContainer = document.createElement('div');
		container.appendChild(this.canvasesContainer);

		// Projects Section (separate container for future dynamic loading)
		this.projectsContainer = document.createElement('div');
		container.appendChild(this.projectsContainer);

		// Show loading state initially
		this.showLoadingState();

		// Check if service is already initialized (handles IDE reload case)
		// If already initialized, load immediately; otherwise wait for event
		this.checkAndLoadCanvases();

		// Load projects (static for now)
		this.loadProjects();

		// Update MCP button states
		this.updateMcpButtonStates();

		// Watch canvases.json for changes (auto-refresh on create/delete)
		this.setupFileWatcher();
	}

	/**
	 * Show loading state in canvases section
	 * Called during renderBody before onDidInitialize fires
	 */
	private showLoadingState(): void {
		if (!this.canvasesContainer) {
			return;
		}

		// Clear existing content
		while (this.canvasesContainer.firstChild) {
			this.canvasesContainer.removeChild(this.canvasesContainer.firstChild);
		}

		this.createSection(this.canvasesContainer, 'Canvases', [
			{ label: 'Loading...', description: 'Waiting for services...', onClick: () => { } }
		]);
	}

	/**
	 * Load canvases from CanvasService immediately
	 * Called when onDidInitialize fires (service is ready) or on canvas events
	 * No timers, no waiting - proper event-based loading!
	 */
	private async loadCanvasesNow(): Promise<void> {
		if (!this.canvasesContainer) {
			this.logger.warn('loadCanvasesNow: canvasesContainer is null');
			return;
		}
		while (this.canvasesContainer.firstChild) {
			this.canvasesContainer.removeChild(this.canvasesContainer.firstChild);
		}
		try {
			const canvases = await this.canvasService.listCanvasesAsync();
			// this.logger.debug('listCanvasesAsync returned canvases', { count: canvases.length, canvases });
			if (canvases.length === 0) {
				this.createSection(this.canvasesContainer, 'Canvases', [
					{ label: 'No canvases yet', description: 'Click "Canvas" to create one', onClick: () => { } }
				]);
				return;
			}
			const items = canvases.map((canvas: CanvasMeta) => ({
				label: canvas.name,
				description: this.formatTimeAgo(canvas.updatedAt),
				onClick: () => this.openCanvas(canvas.id),
				onDelete: () => this.deleteCanvas(canvas.id, canvas.name),
				onRename: () => this.renameCanvas(canvas.id, canvas.name)
			}));
			// this.logger.debug('Rendering canvas items', { count: items.length });
			this.createSection(this.canvasesContainer, 'Canvases', items);
		} catch (err) {
			this.logger.error('Failed to load canvases', err);
			this.createSection(this.canvasesContainer, 'Canvases', [
				{ label: 'Failed to load canvases', description: 'Check console for details', onClick: () => { } }
			]);
		}
	}

	/**
	 * Open a canvas by ID
	 */
	private async openCanvas(canvasId: string): Promise<void> {
		try {
			// Get canvas metadata
			const canvas = await this.canvasService.getCanvasAsync(canvasId);
			if (!canvas) {
				this.notificationService.error(localize('roopik.openCanvas.notFound', 'Canvas not found'));
				return;
			}

			// Directly call the extension command to open the canvas panel
			// This will activate the extension if needed
			await this.commandService.executeCommand('roopik.canvas.open', {
				canvasId: canvas.id,
				canvasName: canvas.name
			});
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			this.notificationService.error(localize('roopik.openCanvas.error', 'Failed to open canvas: {0}', errorMsg));
		}
	}

	/**
	 * Delete a canvas
	 */
	private async deleteCanvas(canvasId: string, canvasName: string): Promise<void> {
		// Confirm deletion
		const confirmed = await this.quickInputService.input({
			title: localize('roopik.deleteCanvas.title', 'Delete Canvas'),
			prompt: localize('roopik.deleteCanvas.prompt', 'Type "{0}" to confirm deletion', canvasName),
			placeHolder: canvasName,
			validateInput: async (value: string) => {
				if (value !== canvasName) {
					return localize('roopik.deleteCanvas.mismatch', 'Name does not match');
				}
				return undefined;
			}
		});

		if (confirmed === canvasName) {
			try {
				await this.canvasService.deleteCanvas(canvasId);
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				this.notificationService.error(localize('roopik.deleteCanvas.error', 'Failed to delete canvas: {0}', errorMsg));
			}
		}
	}

	/**
	 * Rename a canvas
	 */
	private async renameCanvas(canvasId: string, currentName: string): Promise<void> {
		const newName = await this.quickInputService.input({
			title: localize('roopik.renameCanvas.title', 'Rename Canvas'),
			prompt: localize('roopik.renameCanvas.prompt', 'Enter new name for the canvas'),
			value: currentName,
			validateInput: async (value: string) => {
				if (!value || !value.trim()) {
					return localize('roopik.renameCanvas.required', 'Canvas name is required');
				}
				return undefined;
			}
		});

		if (newName && newName !== currentName) {
			try {
				await this.canvasService.updateCanvas(canvasId, { name: newName });
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				this.notificationService.error(localize('roopik.renameCanvas.error', 'Failed to rename canvas: {0}', errorMsg));
			}
		}
	}

	/**
	 * Format timestamp as "X ago"
	 */
	private formatTimeAgo(timestamp: number): string {
		const now = Date.now();
		const diff = now - timestamp;

		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) {
			return `${days}d ago`;
		} else if (hours > 0) {
			return `${hours}h ago`;
		} else if (minutes > 0) {
			return `${minutes}m ago`;
		} else {
			return 'Just now';
		}
	}

	/**
	 * Load projects section - shows loading state initially
	 */
	private loadProjects(): void {
		if (!this.projectsContainer) {
			return;
		}

		// Clear existing content
		while (this.projectsContainer.firstChild) {
			this.projectsContainer.removeChild(this.projectsContainer.firstChild);
		}

		// Show loading state
		this.createSection(this.projectsContainer, 'Recent Projects', [
			{ label: 'Loading...', description: 'Waiting for services...', onClick: () => { } }
		]);

		// Check if already initialized and load
		this.checkAndLoadProjects();
	}

	/**
	 * Check if project storage service is already initialized and load projects
	 * Handles IDE reload case where onDidInitialize already fired
	 */
	private async checkAndLoadProjects(): Promise<void> {
		try {
			const isInitialized = await this.projectStorageService.isInitializedAsync();
			if (isInitialized) {
				// Service already initialized (IDE reload case) - load immediately
				this.projectServiceInitialized = true;
				this.clearProjectLoadingTimeout();
				this.loadProjectsNow();
			} else {
				// Not initialized yet - start timeout, wait for onDidInitialize event
				this.startProjectLoadingTimeout();
			}
		} catch (err) {
			// Service not ready - start timeout as fallback
			this.startProjectLoadingTimeout();
		}
	}

	/**
	 * Load projects from ProjectStorageService immediately
	 * Called when onDidInitialize fires or on project events
	 */
	private async loadProjectsNow(): Promise<void> {
		if (!this.projectsContainer) {
			return;
		}

		// Clear existing content
		while (this.projectsContainer.firstChild) {
			this.projectsContainer.removeChild(this.projectsContainer.firstChild);
		}

		try {
			const projects = await this.projectStorageService.getRecentProjects(5);

			if (projects.length === 0) {
				this.createSection(this.projectsContainer, 'Recent Projects', [
					{ label: 'No recent projects', description: 'Click "Project" to open one', onClick: () => { } }
				]);
				return;
			}

			// Convert to section items
			const items = projects.map((project: ProjectInfo) => {
				// Build description: time + framework (if available)
				let description = this.formatTimeAgo(project.updatedAt);
				if (project.frameworkDisplayName) {
					description += ` • ${project.frameworkDisplayName}`;
				}

				return {
					label: project.name,
					description,
					onClick: () => this.openProject(project),
					onDelete: () => this.deleteProject(project.id, project.name)
				};
			});

			this.createSection(this.projectsContainer, 'Recent Projects', items);
		} catch (err) {
			// Failed to load - show error state
			this.createSection(this.projectsContainer, 'Recent Projects', [
				{ label: 'Failed to load projects', description: 'Check console for details', onClick: () => { } }
			]);
		}
	}

	/**
	 * Open a project in Project Mode
	 */
	private async openProject(project: ProjectInfo): Promise<void> {
		try {
			// Execute the project preview command with the project path
			await this.commandService.executeCommand('roopik.openProjectPreview', {
				projectPath: project.path,
				projectName: project.name
			});
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			this.notificationService.error(localize('roopik.openProject.error', 'Failed to open project: {0}', errorMsg));
		}
	}

	/**
	 * Delete a project from recent projects
	 */
	private async deleteProject(projectId: string, projectName: string): Promise<void> {
		try {
			await this.projectStorageService.deleteProject(projectId);
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			this.notificationService.error(localize('roopik.deleteProject.error', 'Failed to remove project: {0}', errorMsg));
		}
	}

	// ============================================================================
	// MCP Toggle Button
	// ============================================================================

	/**
	 * Create the MCP toggle button
	 * Controls enabling/disabling MCP server for AI agent connections
	 * Styled like Import/Browse buttons but turns blue when active
	 */
	private createMcpButton(): HTMLButtonElement {
		const btn = document.createElement('button');
		btn.style.display = 'inline-flex';
		btn.style.alignItems = 'center';
		btn.style.justifyContent = 'center';
		btn.style.padding = '6px 14px';
		btn.style.borderRadius = '999px';
		btn.style.border = '1px solid var(--vscode-sideBarSectionHeader-border, rgba(148, 163, 184, 0.35))';
		btn.style.boxShadow = '0 0 0 1px var(--vscode-button-border, rgba(96, 165, 250, 0.3))';
		btn.style.cursor = 'pointer';
		btn.style.fontSize = '12px';
		btn.style.fontWeight = '500';
		btn.style.fontFamily = 'inherit';
		btn.style.background = 'transparent';
		btn.style.color = 'var(--vscode-foreground)';
		btn.style.transition = 'background 0.15s ease';

		// Icon
		const icon = document.createElement('span');
		icon.classList.add('codicon', 'codicon-plug');
		icon.style.fontSize = '16px';
		btn.appendChild(icon);

		// Text
		const text = document.createElement('span');
		text.style.marginLeft = '6px';
		text.textContent = 'MCP';
		btn.appendChild(text);

		// Store references for updates
		(btn as any)._mcpIcon = icon;
		(btn as any)._mcpText = text;

		btn.onclick = () => this.toggleMcp();

		return btn;
	}

	/**
	 * Update MCP button state based on server status
	 * When running: blue background (like primary button)
	 * When stopped: transparent with border (like Import/Browse)
	 */
	private async updateMcpButtonStates(): Promise<void> {
		if (!this.mcpButton) {
			return;
		}

		try {
			const status = await this.mcpServerService.getStatus();
			const icon = (this.mcpButton as any)._mcpIcon as HTMLSpanElement;

			if (status.running) {
				// Active state: blue background
				this.mcpButton.style.background = 'var(--vscode-button-background)';
				this.mcpButton.style.color = 'var(--vscode-button-foreground)';
				this.mcpButton.style.border = '1px solid var(--vscode-button-background)';
				icon.classList.remove('codicon-debug-disconnect');
				icon.classList.add('codicon-plug');
				this.mcpButton.title = `MCP Server Running (Port: ${status.wsPort}) - Click to stop`;
			} else {
				// Inactive state: transparent with border (like Import/Browse)
				this.mcpButton.style.background = 'transparent';
				this.mcpButton.style.color = 'var(--vscode-foreground)';
				this.mcpButton.style.border = '1px solid var(--vscode-sideBarSectionHeader-border, rgba(148, 163, 184, 0.35))';
				icon.classList.remove('codicon-plug');
				icon.classList.add('codicon-debug-disconnect');
				this.mcpButton.title = 'MCP Server Stopped - Click to start';
			}
		} catch {
			// Error state: transparent with border
			this.mcpButton.style.background = 'transparent';
			this.mcpButton.style.color = 'var(--vscode-foreground)';
			this.mcpButton.style.border = '1px solid var(--vscode-sideBarSectionHeader-border, rgba(148, 163, 184, 0.35))';
			this.mcpButton.title = 'MCP Server (status unknown)';
		}
	}

	/**
	 * Toggle MCP server (enables/disables AI agent connections)
	 */
	private async toggleMcp(): Promise<void> {
		try {
			const isEnabled = await this.mcpServerService.isEnabled();
			await this.mcpServerService.setEnabled(!isEnabled);

			if (!isEnabled) {
				this.notificationService.info('MCP Server enabled - AI agents can now connect');
			} else {
				this.notificationService.info('MCP Server disabled - Agent connections closed');
			}
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			this.notificationService.error(`Failed to toggle MCP Server: ${errorMsg}`);
		}
	}

	/**
	 * Setup file watcher (placeholder for future file-based watching if needed)
	 * Note: Event subscriptions are handled in constructor via onCanvasCreated/Deleted/Updated
	 */
	private setupFileWatcher(): void {
		// Event subscriptions are now in constructor - no duplicate subscriptions here
	}

	private createSection(container: HTMLElement, title: string, items: Array<{ label: string; description: string; onClick?: () => void; onDelete?: () => void; onRename?: () => void }>): HTMLElement {
		const section = document.createElement('div');
		section.style.marginBottom = '16px';

		// Section header
		const header = document.createElement('div');
		header.textContent = title;
		header.style.fontWeight = '600';
		header.style.fontSize = '13px';
		header.style.color = 'var(--vscode-foreground)';
		header.style.marginBottom = '8px';
		header.style.textTransform = 'uppercase';
		header.style.letterSpacing = '0.5px';
		section.appendChild(header);

		// Items
		items.forEach(item => {
			const itemEl = document.createElement('div');
			itemEl.style.padding = '6px 8px';
			itemEl.style.cursor = item.onClick ? 'pointer' : 'default';
			itemEl.style.borderRadius = '4px';
			itemEl.style.marginBottom = '2px';
			itemEl.style.display = 'flex';
			itemEl.style.alignItems = 'center';
			itemEl.style.position = 'relative';
			itemEl.style.overflow = 'hidden';

			// Left side: label and description
			const contentEl = document.createElement('div');
			contentEl.style.flex = '1';
			contentEl.style.minWidth = '0'; // Allow text truncation

			const labelEl = document.createElement('div');
			labelEl.textContent = item.label;
			labelEl.style.color = 'var(--vscode-foreground)';
			labelEl.style.fontSize = '13px';
			labelEl.style.overflow = 'hidden';
			labelEl.style.textOverflow = 'ellipsis';
			labelEl.style.whiteSpace = 'nowrap';
			contentEl.appendChild(labelEl);

			const descEl = document.createElement('div');
			descEl.textContent = item.description;
			descEl.style.color = 'var(--vscode-descriptionForeground)';
			descEl.style.fontSize = '11px';
			descEl.style.marginTop = '2px';
			contentEl.appendChild(descEl);

			itemEl.appendChild(contentEl);

			// Context menu for rename and delete
			if (item.onRename || item.onDelete) {
				itemEl.addEventListener('contextmenu', (e) => {
					e.preventDefault();
					e.stopPropagation();

					const actions: Action[] = [];

					// Rename action
					if (item.onRename) {
						actions.push(new Action(
							'roopik.renameCanvas',
							localize('roopik.contextMenu.rename', 'Rename'),
							'codicon-edit',
							true,
							async () => { item.onRename!(); }
						));
					}

					// Delete action
					if (item.onDelete) {
						actions.push(new Action(
							'roopik.deleteCanvas',
							localize('roopik.contextMenu.delete', 'Delete'),
							'codicon-trash',
							true,
							async () => { item.onDelete!(); }
						));
					}

					this.contextMenuService.showContextMenu({
						getAnchor: () => ({ x: e.clientX, y: e.clientY }),
						getActions: () => actions
					});
				});
			}

			// Enhanced hover effect (only if clickable)
			if (item.onClick) {
				itemEl.style.transition = 'background-color 0.15s ease, transform 0.15s ease';

				itemEl.addEventListener('mouseenter', () => {
					itemEl.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
					itemEl.style.transform = 'translateX(2px)';
				});
				itemEl.addEventListener('mouseleave', () => {
					itemEl.style.backgroundColor = 'transparent';
					itemEl.style.transform = 'translateX(0)';
				});

				// Click handler
				itemEl.addEventListener('click', () => {
					item.onClick!();
				});
			}

			section.appendChild(itemEl);
		});

		container.appendChild(section);
		return section;
	}

	private createPrimaryActionButton(label: string, codiconClass: string, commandId: string, largeButton: boolean = false, extraLarge: boolean = false): HTMLElement {
		const btn = document.createElement('button');
		btn.style.display = 'inline-flex';
		btn.style.alignItems = 'center';
		btn.style.justifyContent = 'center';
		// Extra large for mode buttons, large for import, small for others
		btn.style.padding = extraLarge ? '8px 18px' : (largeButton ? '6px 14px' : '3px 10px');
		btn.style.borderRadius = '999px';
		btn.style.border = '1px solid var(--vscode-sideBarSectionHeader-border, rgba(148, 163, 184, 0.35))';
		// Subtle outline for better visibility
		btn.style.boxShadow = '0 0 0 1px var(--vscode-button-border, rgba(96, 165, 250, 0.3))';
		btn.style.cursor = 'pointer';
		// Extra large font for mode buttons, large for import, small for others
		btn.style.fontSize = extraLarge ? '13px' : (largeButton ? '12px' : '11px');
		btn.style.fontWeight = '500';
		btn.style.fontFamily = 'inherit';
		btn.style.background = 'var(--vscode-sideBarSectionHeader-background, rgba(15, 23, 42, 0.8))';
		btn.style.color = 'var(--vscode-foreground)';
		btn.title = label;

		btn.onmouseenter = () => {
			btn.style.background = 'var(--vscode-list-hoverBackground)';
		};
		btn.onmouseleave = () => {
			btn.style.background = 'var(--vscode-sideBarSectionHeader-background, rgba(15, 23, 42, 0.8))';
		};

		const icon = document.createElement('span');
		icon.classList.add('codicon', codiconClass);
		// Extra large icon for mode buttons, large for import, small for others
		icon.style.fontSize = extraLarge ? '18px' : (largeButton ? '16px' : '12px');
		btn.appendChild(icon);

		const text = document.createElement('span');
		text.textContent = label;
		text.style.marginLeft = extraLarge ? '8px' : (largeButton ? '6px' : '4px');
		btn.appendChild(text);

		btn.onclick = () => {
			this.commandService.executeCommand(commandId);
		};

		return btn;
	}

	private createSecondaryActionButton(label: string, codiconClass: string, commandId: string, largeButton: boolean = false, extraLarge: boolean = false): HTMLElement {
		const btn = document.createElement('button');
		btn.style.display = 'inline-flex';
		btn.style.alignItems = 'center';
		btn.style.justifyContent = 'center';
		// Extra large for mode buttons, large for import, small for others
		btn.style.padding = extraLarge ? '8px 18px' : (largeButton ? '6px 14px' : '3px 10px');
		btn.style.borderRadius = '999px';
		btn.style.border = '1px solid var(--vscode-sideBarSectionHeader-border, rgba(148, 163, 184, 0.35))';
		// Subtle outline for better visibility
		btn.style.boxShadow = '0 0 0 1px var(--vscode-button-border, rgba(96, 165, 250, 0.3))';
		btn.style.cursor = 'pointer';
		// Extra large font for mode buttons, large for import, small for others
		btn.style.fontSize = extraLarge ? '13px' : (largeButton ? '12px' : '11px');
		btn.style.fontWeight = '500';
		btn.style.fontFamily = 'inherit';
		btn.style.background = 'transparent';
		btn.style.color = 'var(--vscode-foreground)';
		btn.title = label;

		btn.onmouseenter = () => {
			btn.style.background = 'var(--vscode-list-hoverBackground)';
		};
		btn.onmouseleave = () => {
			btn.style.background = 'transparent';
		};

		const icon = document.createElement('span');
		icon.classList.add('codicon', codiconClass);
		// Extra large icon for mode buttons, large for import, small for others
		icon.style.fontSize = extraLarge ? '18px' : (largeButton ? '16px' : '12px');
		btn.appendChild(icon);

		const text = document.createElement('span');
		text.textContent = label;
		text.style.marginLeft = extraLarge ? '8px' : (largeButton ? '6px' : '4px');
		btn.appendChild(text);

		btn.onclick = () => {
			this.commandService.executeCommand(commandId);
		};

		return btn;
	}

	/**
	 * Inject CSS animations for professional delete interactions
	 */
	private injectDeleteAnimations(): void {
		if (RoopikDashboardView.animationsInjected) {
			return;
		}

		const style = document.createElement('style');
		style.textContent = `
			@keyframes roopik-pulse {
				0%, 100% { transform: scale(1); }
				50% { transform: scale(1.15); }
			}
		`;
		mainWindow.document.head.appendChild(style);
		RoopikDashboardView.animationsInjected = true;
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}
}

/**
 * Roopik View Pane Container
 * Container for Roopik views in the activity bar
 */
export class RoopikViewPaneContainer extends ViewPaneContainer {
	constructor(
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IExtensionService extensionService: IExtensionService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@ILogService logService: ILogService,
	) {
		super(ROOPIK_VIEWLET_ID, { mergeViewWithContainerWhenSingleView: true }, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService, logService);
	}

	override create(parent: HTMLElement): void {
		super.create(parent);
		parent.classList.add('roopik-viewlet');
	}
}

/**
 * Registers Roopik views
 */
export class RoopikViewsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.roopikViews';

	constructor() {
		super();
		this.registerViews();
	}

	private registerViews(): void {
		const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);

		const dashboardViewDescriptor: IViewDescriptor = {
			id: RoopikDashboardView.ID,
			name: RoopikDashboardView.NAME,
			ctorDescriptor: new SyncDescriptor(RoopikDashboardView),
			containerIcon: roopikViewIcon,
			order: 1,
			canToggleVisibility: false
		};

		viewsRegistry.registerViews([dashboardViewDescriptor], VIEW_CONTAINER);
	}
}

// Register view container in Activity Bar
const viewContainerRegistry = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry);

export const VIEW_CONTAINER: ViewContainer = viewContainerRegistry.registerViewContainer({
	id: ROOPIK_VIEWLET_ID,
	title: localize2('roopik', "Roopik"),
	ctorDescriptor: new SyncDescriptor(RoopikViewPaneContainer),
	storageId: 'workbench.roopik.views.state',
	icon: roopikViewIcon,
	alwaysUseContainerInfo: true,
	order: 1, // Second position in activity bar (after Explorer which is 0)
	openCommandActionDescriptor: {
		id: ROOPIK_VIEWLET_ID,
		title: localize2('roopik', "Roopik"),
		mnemonicTitle: localize({ key: 'miViewRoopik', comment: ['&& denotes a mnemonic'] }, "&&Roopik"),
		keybindings: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR },
		order: 1
	},
}, ViewContainerLocation.Sidebar, { isDefault: true }); // Default view on startup (unless user changed it)
