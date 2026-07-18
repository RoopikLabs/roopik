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
	private mcpDetailsPanel: HTMLElement | undefined;
	private mcpPanelAutoCloseTimeout: ReturnType<typeof setTimeout> | undefined;
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

	/** Max items visible before scrolling */
	private static readonly MAX_VISIBLE_ITEMS = 5;
	/** Item height in pixels for calculating max-height */
	private static readonly ITEM_HEIGHT = 44;

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		// Inject CSS for professional animations
		this.injectDeleteAnimations();

		// Clear existing content to prevent duplicates on re-render
		while (container.firstChild) {
			container.removeChild(container.firstChild);
		}

		container.style.padding = '12px';
		container.style.display = 'flex';
		container.style.flexDirection = 'column';
		container.style.gap = '16px';
		container.style.height = '100%';
		container.style.boxSizing = 'border-box';

		// ============================================================================
		// Action Bar - Outlined wrapper, responsive grid (auto-collapses on narrow widths)
		// ============================================================================
		const actionsContainer = document.createElement('div');
		actionsContainer.style.display = 'flex';
		actionsContainer.style.flexDirection = 'column';
		actionsContainer.style.gap = '10px';
		actionsContainer.style.padding = '10px';
		actionsContainer.style.borderRadius = '8px';
		actionsContainer.style.border = '1px solid var(--vscode-panel-border, var(--vscode-contrastBorder, rgba(128, 128, 128, 0.4)))';
		actionsContainer.style.background = 'var(--vscode-sideBarSectionHeader-background, transparent)';
		actionsContainer.style.maxWidth = '320px';
		actionsContainer.style.boxSizing = 'border-box';

		// Primary actions grid: 4 buttons that auto-collapse based on available width.
		// At full width: 4 columns. Narrow: drops to 2 then 1 automatically via auto-fit + minmax.
		const actionsGrid = document.createElement('div');
		actionsGrid.style.display = 'grid';
		actionsGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(110px, 1fr))';
		actionsGrid.style.gap = '6px';

		const newCanvasBtn = this.createActionButton('Canvas', 'codicon-paintcan', 'roopik.openCanvas', true);
		const importBtn = this.createActionButton('Import', 'codicon-cloud-download', 'roopik.import.showPicker', false);
		importBtn.title = 'Import Component';

		const projectModeBtn = this.createActionButton('Project', 'codicon-folder-opened', 'roopik.openProjectPicker', false);
		const browserBtn = this.createActionButton('Browser', 'codicon-globe', 'roopik.openProjectPreview', false);
		browserBtn.title = 'Open in Browser';

		actionsGrid.appendChild(newCanvasBtn);
		actionsGrid.appendChild(importBtn);
		actionsGrid.appendChild(projectModeBtn);
		actionsGrid.appendChild(browserBtn);

		// MCP row (standalone, sits below the grid inside the same outlined container)
		const mcpRow = document.createElement('div');
		mcpRow.style.display = 'flex';
		mcpRow.style.alignItems = 'center';

		this.mcpButton = this.createMcpButton();
		mcpRow.appendChild(this.mcpButton);

		// MCP Details Panel (inline, shown when MCP is running)
		this.mcpDetailsPanel = document.createElement('div');
		this.mcpDetailsPanel.style.display = 'none'; // Hidden by default

		actionsContainer.appendChild(actionsGrid);
		actionsContainer.appendChild(mcpRow);
		actionsContainer.appendChild(this.mcpDetailsPanel);
		container.appendChild(actionsContainer);

		// ============================================================================
		// Content area - scrollable sections
		// ============================================================================
		const contentArea = document.createElement('div');
		contentArea.style.flex = '1';
		contentArea.style.display = 'flex';
		contentArea.style.flexDirection = 'column';
		contentArea.style.gap = '16px';
		contentArea.style.minHeight = '0'; // Allow shrinking
		contentArea.style.overflow = 'hidden';

		// Canvases Section
		this.canvasesContainer = document.createElement('div');
		contentArea.appendChild(this.canvasesContainer);

		// Projects Section
		this.projectsContainer = document.createElement('div');
		contentArea.appendChild(this.projectsContainer);

		container.appendChild(contentArea);

		// Show loading state initially
		this.showLoadingState();

		// Check if service is already initialized (handles IDE reload case)
		this.checkAndLoadCanvases();

		// Load projects
		this.loadProjects();

		// Update MCP button states
		this.updateMcpButtonStates();

		// Setup event subscriptions
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
	 * Create a primary or secondary action button (Canvas, Project)
	 */
	private createActionButton(label: string, codiconClass: string, commandId: string, primary: boolean): HTMLButtonElement {
		const btn = document.createElement('button');
		btn.style.display = 'inline-flex';
		btn.style.alignItems = 'center';
		btn.style.justifyContent = 'center';
		btn.style.padding = '7px 10px';
		btn.style.borderRadius = '6px';
		btn.style.border = 'none';
		btn.style.cursor = 'pointer';
		btn.style.fontSize = '12px';
		btn.style.fontWeight = '500';
		btn.style.fontFamily = 'inherit';
		btn.style.transition = 'all 0.12s ease';
		btn.style.width = '100%';
		btn.style.minWidth = '0';
		btn.style.whiteSpace = 'nowrap';
		btn.style.overflow = 'hidden';
		btn.title = label;

		if (primary) {
			btn.style.background = 'var(--vscode-button-background)';
			btn.style.color = 'var(--vscode-button-foreground)';
			btn.onmouseenter = () => {
				btn.style.background = 'var(--vscode-button-hoverBackground)';
			};
			btn.onmouseleave = () => {
				btn.style.background = 'var(--vscode-button-background)';
			};
		} else {
			btn.style.background = 'var(--vscode-button-secondaryBackground)';
			btn.style.color = 'var(--vscode-button-secondaryForeground)';
			btn.onmouseenter = () => {
				btn.style.background = 'var(--vscode-button-secondaryHoverBackground)';
			};
			btn.onmouseleave = () => {
				btn.style.background = 'var(--vscode-button-secondaryBackground)';
			};
		}

		const icon = document.createElement('span');
		icon.classList.add('codicon', codiconClass);
		icon.style.fontSize = '14px';
		icon.style.color = 'inherit'; // Inherit button foreground color
		btn.appendChild(icon);

		const text = document.createElement('span');
		text.textContent = label;
		text.style.marginLeft = '6px';
		text.style.color = 'inherit'; // Inherit button foreground color
		btn.appendChild(text);

		btn.onclick = () => this.commandService.executeCommand(commandId);

		return btn;
	}

	/**
	 * Create the MCP toggle button with status indicator
	 */
	private createMcpButton(): HTMLButtonElement {
		const btn = document.createElement('button');
		btn.style.display = 'inline-flex';
		btn.style.alignItems = 'center';
		btn.style.justifyContent = 'center';
		btn.style.padding = '4px 10px';
		btn.style.borderRadius = '4px';
		btn.style.border = '1px solid var(--vscode-input-border, rgba(128, 128, 128, 0.3))';
		btn.style.cursor = 'pointer';
		btn.style.fontSize = '11px';
		btn.style.fontWeight = '400';
		btn.style.fontFamily = 'inherit';
		btn.style.background = 'transparent';
		btn.style.color = 'var(--vscode-foreground)';
		btn.style.transition = 'all 0.12s ease';
		btn.style.opacity = '0.8';

		const icon = document.createElement('span');
		icon.classList.add('codicon', 'codicon-plug');
		icon.style.fontSize = '12px';
		btn.appendChild(icon);

		const text = document.createElement('span');
		text.textContent = 'MCP';
		text.style.marginLeft = '4px';
		btn.appendChild(text);

		// Store references for updates
		(btn as any)._mcpIcon = icon;
		(btn as any)._mcpText = text;

		btn.onclick = () => this.toggleMcp();

		return btn;
	}

	/**
	 * Update MCP button state based on server status
	 * Running: green background, plug icon, show details panel
	 * Stopped: muted, disconnected icon, hide details panel
	 */
	private async updateMcpButtonStates(): Promise<void> {
		if (!this.mcpButton) {
			return;
		}

		try {
			const status = await this.mcpServerService.getStatus();
			this.logger.debug('MCP status update', { running: status.running, wsPort: status.wsPort });
			const icon = (this.mcpButton as any)._mcpIcon as HTMLSpanElement;

			if (status.running) {
				// Active state: vibrant green - clearly visible in both light and dark themes
				this.mcpButton.style.background = 'rgba(34, 197, 94, 0.4)';
				this.mcpButton.style.borderColor = 'rgba(34, 197, 94, 0.8)';
				// Bold black/white text based on theme
				this.mcpButton.style.color = 'var(--vscode-editor-foreground)'; // Strong foreground color
				this.mcpButton.style.opacity = '1';
				this.mcpButton.style.fontWeight = '700'; // Bold
				icon.style.color = '#16a34a'; // Darker green icon for visibility
				icon.classList.remove('codicon-debug-disconnect');
				icon.classList.add('codicon-plug');
				this.mcpButton.title = `MCP Running (Port ${status.wsPort}) - Click to stop`;

				this.mcpButton.onmouseenter = () => {
					this.mcpButton!.style.background = 'rgba(34, 197, 94, 0.5)';
				};
				this.mcpButton.onmouseleave = () => {
					this.mcpButton!.style.background = 'rgba(34, 197, 94, 0.35)';
				};

				// Show connection details panel
				this.showMcpConnectionPopup(status.wsPort);
			} else {
				// Inactive state: muted like Import/Browse
				this.mcpButton.style.background = 'transparent';
				this.mcpButton.style.borderColor = 'var(--vscode-input-border, rgba(128, 128, 128, 0.3))';
				this.mcpButton.style.color = 'var(--vscode-foreground)';
				this.mcpButton.style.opacity = '0.8';
				this.mcpButton.style.fontWeight = '400';
				icon.style.color = 'inherit'; // Reset icon color
				icon.classList.remove('codicon-plug');
				icon.classList.add('codicon-debug-disconnect');
				this.mcpButton.title = 'MCP Stopped - Click to start';

				this.mcpButton.onmouseenter = () => {
					this.mcpButton!.style.background = 'var(--vscode-list-hoverBackground)';
					this.mcpButton!.style.opacity = '1';
				};
				this.mcpButton.onmouseleave = () => {
					this.mcpButton!.style.background = 'transparent';
					this.mcpButton!.style.opacity = '0.8';
				};

				// Hide connection details panel
				this.hideMcpConnectionPopup();
			}
		} catch {
			// Error state
			this.mcpButton.style.background = 'transparent';
			this.mcpButton.style.color = 'var(--vscode-disabledForeground)';
			this.mcpButton.style.opacity = '0.5';
			this.mcpButton.title = 'MCP (status unknown)';
			this.hideMcpConnectionPopup();
		}
	}

	/**
	 * Toggle MCP server (enables/disables AI agent connections)
	 */
	private async toggleMcp(): Promise<void> {
		try {
			const isEnabled = await this.mcpServerService.isEnabled();
			await this.mcpServerService.setEnabled(!isEnabled);

			// Update button state (will also show/hide connection details panel)
			await this.updateMcpButtonStates();

			if (isEnabled) {
				this.notificationService.info('MCP Server disabled');
			}
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			this.notificationService.error(`Failed to toggle MCP Server: ${errorMsg}`);
		}
	}

	/**
	 * Show MCP connection details panel inline below the MCP button
	 * Displays MCP server info - agents are auto-registered via Settings
	 * Auto-closes after 10 seconds
	 */
	private showMcpConnectionPopup(port: number): void {
		this.logger.debug('showMcpConnectionPopup called', { port, hasPanelElement: !!this.mcpDetailsPanel });
		if (!this.mcpDetailsPanel) {
			this.logger.warn('mcpDetailsPanel is null, cannot show popup');
			return;
		}

		// Clear any existing auto-close timeout
		if (this.mcpPanelAutoCloseTimeout) {
			clearTimeout(this.mcpPanelAutoCloseTimeout);
		}

		// Clear existing content
		while (this.mcpDetailsPanel.firstChild) {
			this.mcpDetailsPanel.removeChild(this.mcpDetailsPanel.firstChild);
		}

		// Style the panel container - compact and visible
		this.mcpDetailsPanel.style.display = 'block';
		this.mcpDetailsPanel.style.marginTop = '10px';
		this.mcpDetailsPanel.style.padding = '10px 12px';
		this.mcpDetailsPanel.style.background = 'var(--vscode-editor-background)';
		this.mcpDetailsPanel.style.border = '2px solid #22c55e';
		this.mcpDetailsPanel.style.borderRadius = '8px';
		this.mcpDetailsPanel.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';

		// Header row with status dot, title and close button
		const header = document.createElement('div');
		header.style.display = 'flex';
		header.style.alignItems = 'center';
		header.style.justifyContent = 'space-between';
		header.style.marginBottom = '8px';

		const titleWrapper = document.createElement('div');
		titleWrapper.style.display = 'flex';
		titleWrapper.style.alignItems = 'center';
		titleWrapper.style.gap = '6px';

		const statusDot = document.createElement('span');
		statusDot.style.width = '8px';
		statusDot.style.height = '8px';
		statusDot.style.borderRadius = '50%';
		statusDot.style.background = '#22c55e';
		statusDot.style.boxShadow = '0 0 6px rgba(34, 197, 94, 0.6)';
		titleWrapper.appendChild(statusDot);

		const subtitle = document.createElement('div');
		subtitle.textContent = 'MCP Server Running';
		subtitle.style.fontSize = '12px';
		subtitle.style.fontWeight = '600';
		subtitle.style.color = 'var(--vscode-foreground)';
		titleWrapper.appendChild(subtitle);

		header.appendChild(titleWrapper);

		// Close button
		const closeBtn = document.createElement('button');
		closeBtn.style.background = 'transparent';
		closeBtn.style.border = 'none';
		closeBtn.style.cursor = 'pointer';
		closeBtn.style.padding = '4px';
		closeBtn.style.borderRadius = '4px';
		closeBtn.style.display = 'flex';
		closeBtn.style.alignItems = 'center';
		closeBtn.style.color = 'var(--vscode-descriptionForeground)';
		closeBtn.style.transition = 'all 0.12s ease';
		closeBtn.title = 'Close';

		const closeIcon = document.createElement('span');
		closeIcon.classList.add('codicon', 'codicon-close');
		closeIcon.style.fontSize = '14px';
		closeBtn.appendChild(closeIcon);

		closeBtn.onmouseenter = () => {
			closeBtn.style.background = 'var(--vscode-toolbar-hoverBackground)';
			closeBtn.style.color = 'var(--vscode-foreground)';
		};
		closeBtn.onmouseleave = () => {
			closeBtn.style.background = 'transparent';
			closeBtn.style.color = 'var(--vscode-descriptionForeground)';
		};
		closeBtn.onclick = () => this.hideMcpConnectionPopup();
		header.appendChild(closeBtn);

		this.mcpDetailsPanel.appendChild(header);

		// Simple info box with Server and Transport
		const infoBox = document.createElement('div');
		infoBox.style.padding = '8px 10px';
		infoBox.style.background = 'var(--vscode-input-background)';
		infoBox.style.borderRadius = '6px';
		infoBox.style.border = '1px solid var(--vscode-input-border, rgba(128, 128, 128, 0.2))';
		infoBox.style.fontSize = '11px';
		infoBox.style.lineHeight = '1.6';

		const serverLine = document.createElement('div');
		serverLine.style.display = 'flex';
		serverLine.style.justifyContent = 'space-between';
		const serverLabel = document.createElement('span');
		serverLabel.textContent = 'MCP Server';
		serverLabel.style.color = 'var(--vscode-descriptionForeground)';
		const serverValue = document.createElement('code');
		serverValue.textContent = 'roopik';
		serverValue.style.color = 'var(--vscode-foreground)';
		serverValue.style.fontFamily = 'var(--vscode-editor-font-family, monospace)';
		serverLine.appendChild(serverLabel);
		serverLine.appendChild(serverValue);
		infoBox.appendChild(serverLine);

		const transportLine = document.createElement('div');
		transportLine.style.display = 'flex';
		transportLine.style.justifyContent = 'space-between';
		transportLine.style.marginTop = '4px';
		const transportLabel = document.createElement('span');
		transportLabel.textContent = 'Transport';
		transportLabel.style.color = 'var(--vscode-descriptionForeground)';
		const transportValue = document.createElement('code');
		transportValue.textContent = 'STDIO';
		transportValue.style.color = 'var(--vscode-foreground)';
		transportValue.style.fontFamily = 'var(--vscode-editor-font-family, monospace)';
		transportLine.appendChild(transportLabel);
		transportLine.appendChild(transportValue);
		infoBox.appendChild(transportLine);

		this.mcpDetailsPanel.appendChild(infoBox);

		// Info text about auto-registration
		const infoText = document.createElement('div');
		infoText.style.marginTop = '8px';
		infoText.style.fontSize = '10px';
		infoText.style.color = 'var(--vscode-descriptionForeground)';
		infoText.style.lineHeight = '1.4';
		infoText.textContent = '💡 AI agents are auto-registered when enabled in Settings.';
		this.mcpDetailsPanel.appendChild(infoText);

		// Open Settings button
		const settingsBtn = document.createElement('button');
		settingsBtn.style.width = '100%';
		settingsBtn.style.marginTop = '8px';
		settingsBtn.style.padding = '6px 10px';
		settingsBtn.style.borderRadius = '6px';
		settingsBtn.style.border = '1px solid rgba(34, 197, 94, 0.4)';
		settingsBtn.style.background = 'rgba(34, 197, 94, 0.15)';
		settingsBtn.style.color = 'var(--vscode-foreground)';
		settingsBtn.style.cursor = 'pointer';
		settingsBtn.style.fontSize = '11px';
		settingsBtn.style.fontWeight = '500';
		settingsBtn.style.transition = 'all 0.12s ease';
		settingsBtn.style.display = 'flex';
		settingsBtn.style.alignItems = 'center';
		settingsBtn.style.justifyContent = 'center';
		settingsBtn.style.gap = '5px';

		const settingsIcon = document.createElement('span');
		settingsIcon.classList.add('codicon', 'codicon-settings-gear');
		settingsIcon.style.fontSize = '12px';
		settingsBtn.appendChild(settingsIcon);

		const settingsText = document.createElement('span');
		settingsText.textContent = 'Open MCP Settings';
		settingsBtn.appendChild(settingsText);

		settingsBtn.onmouseenter = () => {
			settingsBtn.style.background = 'rgba(34, 197, 94, 0.25)';
			settingsBtn.style.borderColor = 'rgba(34, 197, 94, 0.6)';
		};
		settingsBtn.onmouseleave = () => {
			settingsBtn.style.background = 'rgba(34, 197, 94, 0.15)';
			settingsBtn.style.borderColor = 'rgba(34, 197, 94, 0.4)';
		};

		settingsBtn.onclick = () => {
			this.commandService.executeCommand('workbench.action.openSettings', 'roopik.mcp');
		};

		this.mcpDetailsPanel.appendChild(settingsBtn);

		// Auto-close after 10 seconds
		this.mcpPanelAutoCloseTimeout = setTimeout(() => {
			this.hideMcpConnectionPopup();
		}, 10000);

		this.logger.debug('MCP details panel rendered');
	}

	/**
	 * Hide MCP connection details panel
	 */
	private hideMcpConnectionPopup(): void {
		// Clear auto-close timeout
		if (this.mcpPanelAutoCloseTimeout) {
			clearTimeout(this.mcpPanelAutoCloseTimeout);
			this.mcpPanelAutoCloseTimeout = undefined;
		}

		if (this.mcpDetailsPanel) {
			this.mcpDetailsPanel.style.display = 'none';
			while (this.mcpDetailsPanel.firstChild) {
				this.mcpDetailsPanel.removeChild(this.mcpDetailsPanel.firstChild);
			}
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
		section.style.display = 'flex';
		section.style.flexDirection = 'column';
		section.style.minHeight = '0'; // Allow shrinking

		// Section header with count badge
		const header = document.createElement('div');
		header.style.display = 'flex';
		header.style.alignItems = 'center';
		header.style.justifyContent = 'space-between';
		header.style.marginBottom = '8px';
		header.style.paddingBottom = '6px';
		header.style.borderBottom = '1px solid var(--vscode-sideBarSectionHeader-border, rgba(128, 128, 128, 0.2))';

		const titleEl = document.createElement('span');
		titleEl.textContent = title;
		titleEl.style.fontWeight = '500';
		titleEl.style.fontSize = '11px';
		titleEl.style.color = 'var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground))';
		titleEl.style.textTransform = 'uppercase';
		titleEl.style.letterSpacing = '0.8px';
		header.appendChild(titleEl);

		// Count badge (only show if items > 0 and not loading)
		const hasRealItems = items.length > 0 && !items[0].label.includes('Loading') && !items[0].label.includes('No ');
		if (hasRealItems) {
			const countBadge = document.createElement('span');
			countBadge.textContent = String(items.length);
			countBadge.style.fontSize = '10px';
			countBadge.style.color = 'var(--vscode-descriptionForeground)';
			countBadge.style.background = 'var(--vscode-badge-background, rgba(128, 128, 128, 0.2))';
			countBadge.style.padding = '1px 6px';
			countBadge.style.borderRadius = '10px';
			header.appendChild(countBadge);
		}

		section.appendChild(header);

		// Items container with scroll
		const itemsContainer = document.createElement('div');
		itemsContainer.style.display = 'flex';
		itemsContainer.style.flexDirection = 'column';
		itemsContainer.style.gap = '2px';

		// Apply max-height and scroll only if more than MAX_VISIBLE_ITEMS
		if (items.length > RoopikDashboardView.MAX_VISIBLE_ITEMS) {
			const maxHeight = RoopikDashboardView.MAX_VISIBLE_ITEMS * RoopikDashboardView.ITEM_HEIGHT;
			itemsContainer.style.maxHeight = `${maxHeight}px`;
			itemsContainer.style.overflowY = 'auto';
			itemsContainer.style.overflowX = 'hidden';
			// Custom scrollbar styling
			itemsContainer.style.scrollbarWidth = 'thin';
			itemsContainer.style.scrollbarColor = 'var(--vscode-scrollbarSlider-background) transparent';
		}

		// Items
		items.forEach(item => {
			const itemEl = document.createElement('div');
			itemEl.style.padding = '8px 10px';
			itemEl.style.cursor = item.onClick ? 'pointer' : 'default';
			itemEl.style.borderRadius = '6px';
			itemEl.style.display = 'flex';
			itemEl.style.alignItems = 'center';
			itemEl.style.position = 'relative';
			itemEl.style.minHeight = '36px';
			itemEl.style.boxSizing = 'border-box';

			// Left side: label and description
			const contentEl = document.createElement('div');
			contentEl.style.flex = '1';
			contentEl.style.minWidth = '0'; // Allow text truncation

			const labelEl = document.createElement('div');
			labelEl.textContent = item.label;
			labelEl.style.color = 'var(--vscode-foreground)';
			labelEl.style.fontSize = '13px';
			labelEl.style.fontWeight = '400';
			labelEl.style.overflow = 'hidden';
			labelEl.style.textOverflow = 'ellipsis';
			labelEl.style.whiteSpace = 'nowrap';
			labelEl.style.lineHeight = '1.3';
			contentEl.appendChild(labelEl);

			const descEl = document.createElement('div');
			descEl.textContent = item.description;
			descEl.style.color = 'var(--vscode-descriptionForeground)';
			descEl.style.fontSize = '11px';
			descEl.style.marginTop = '2px';
			descEl.style.lineHeight = '1.2';
			descEl.style.overflow = 'hidden';
			descEl.style.textOverflow = 'ellipsis';
			descEl.style.whiteSpace = 'nowrap';
			contentEl.appendChild(descEl);

			itemEl.appendChild(contentEl);

			// Context menu for rename and delete
			if (item.onRename || item.onDelete) {
				itemEl.addEventListener('contextmenu', (e) => {
					e.preventDefault();
					e.stopPropagation();

					const actions: Action[] = [];

					if (item.onRename) {
						actions.push(new Action(
							'roopik.renameCanvas',
							localize('roopik.contextMenu.rename', 'Rename'),
							'codicon-edit',
							true,
							async () => { item.onRename!(); }
						));
					}

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

			// Hover effect (only if clickable)
			if (item.onClick) {
				itemEl.style.transition = 'background-color 0.12s ease';

				itemEl.addEventListener('mouseenter', () => {
					itemEl.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
				});
				itemEl.addEventListener('mouseleave', () => {
					itemEl.style.backgroundColor = 'transparent';
				});

				itemEl.addEventListener('click', () => {
					item.onClick!();
				});
			}

			itemsContainer.appendChild(itemEl);
		});

		section.appendChild(itemsContainer);
		container.appendChild(section);
		return section;
	}

	/**
	 * Inject CSS animations for professional interactions
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
