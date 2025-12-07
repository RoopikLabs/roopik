/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
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
import { ILogService } from '../../../../platform/log/common/log.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { Action } from '../../../../base/common/actions.js';
import { ICanvasService } from '../common/canvas/index.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import type { CanvasMeta } from '../common/canvas/types.js';

const roopikViewIcon = registerIcon('roopik-view-icon', Codicon.paintcan, localize('roopikViewIcon', 'View icon of the Roopik view.'));

export const ROOPIK_VIEWLET_ID = 'workbench.view.roopik';
export const ROOPIK_VIEW_ID = 'roopik.dashboardView';

/**
 * Roopik Dashboard View
 * Shows canvases and projects in a tree structure
 */
export class RoopikDashboardView extends ViewPane {
	static readonly ID = ROOPIK_VIEW_ID;
	static readonly NAME = localize2('roopikDashboard', "Dashboard");

	private canvasesContainer: HTMLElement | undefined;
	private projectsContainer: HTMLElement | undefined;
	private static animationsInjected = false;

	/** Timeout handle for loading state */
	private loadingTimeoutHandle: ReturnType<typeof setTimeout> | undefined;

	/** Whether we've received the initialization event */
	private serviceInitialized: boolean = false;

	/** Loading timeout in milliseconds (5 seconds) */
	private static readonly LOADING_TIMEOUT_MS = 5000;

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
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		console.log('[RoopikDashboardView] Constructor called');

		// Subscribe to onDidInitialize - this fires when CanvasService is fully ready
		// This is the ONLY trigger for loading canvases - no premature attempts!
		this._register(this.canvasService.onDidInitialize(() => {
			console.log('[RoopikDashboardView] EVENT: onDidInitialize received - CanvasService is ready');
			this.serviceInitialized = true;
			this.clearLoadingTimeout();
			this.loadCanvasesNow();
		}));

		// Subscribe to canvas events to auto-refresh the list
		this._register(this.canvasService.onCanvasCreated((event) => {
			console.log('[RoopikDashboardView] EVENT: onCanvasCreated received', event);
			this.loadCanvasesNow();
		}));
		this._register(this.canvasService.onCanvasDeleted((event) => {
			console.log('[RoopikDashboardView] EVENT: onCanvasDeleted received', event);
			this.loadCanvasesNow();
		}));
		this._register(this.canvasService.onCanvasUpdated((event) => {
			console.log('[RoopikDashboardView] EVENT: onCanvasUpdated received', event);
			this.loadCanvasesNow();
		}));
	}

	/**
	 * Clear the loading timeout if it exists
	 */
	private clearLoadingTimeout(): void {
		if (this.loadingTimeoutHandle) {
			clearTimeout(this.loadingTimeoutHandle);
			this.loadingTimeoutHandle = undefined;
		}
	}

	/**
	 * Start loading timeout - shows error state if onDidInitialize never fires
	 */
	private startLoadingTimeout(): void {
		this.clearLoadingTimeout();
		this.loadingTimeoutHandle = setTimeout(() => {
			if (!this.serviceInitialized) {
				console.warn('[RoopikDashboardView] Loading timeout - service initialization took too long');
				this.showTimeoutState();
			}
		}, RoopikDashboardView.LOADING_TIMEOUT_MS);
	}

	/**
	 * Show timeout/error state when initialization takes too long
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
	 * Check if service is already initialized and load canvases
	 * This handles the IDE reload case where onDidInitialize already fired
	 */
	private async checkAndLoadCanvases(): Promise<void> {
		console.log('[RoopikDashboardView] checkAndLoadCanvases: checking if service is already initialized...');

		try {
			const isInitialized = await this.canvasService.isInitializedAsync();
			console.log('[RoopikDashboardView] checkAndLoadCanvases: isInitialized =', isInitialized);

			if (isInitialized) {
				// Service already initialized (IDE reload case) - load immediately
				console.log('[RoopikDashboardView] Service already initialized, loading canvases now');
				this.serviceInitialized = true;
				this.clearLoadingTimeout();
				this.loadCanvasesNow();
			} else {
				// Not initialized yet - start timeout, wait for onDidInitialize event
				console.log('[RoopikDashboardView] Service not initialized yet, waiting for event...');
				this.startLoadingTimeout();
			}
		} catch (err) {
			console.error('[RoopikDashboardView] checkAndLoadCanvases: error checking initialization:', err);
			// Start timeout as fallback
			this.startLoadingTimeout();
		}
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		console.log('[RoopikDashboardView] renderBody called');

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

		// Top action bar (New Canvas, Project Mode)
		const actionsRow = document.createElement('div');
		actionsRow.style.display = 'flex';
		actionsRow.style.alignItems = 'center';
		actionsRow.style.justifyContent = 'flex-start';
		actionsRow.style.gap = '6px';
		actionsRow.style.marginBottom = '8px';

		const buttonsRow = document.createElement('div');
		buttonsRow.style.display = 'flex';
		buttonsRow.style.alignItems = 'center';
		buttonsRow.style.gap = '4px';
		buttonsRow.style.flexWrap = 'wrap';

		// Mode buttons (Canvas and Project) - larger icons
		const newCanvasBtn = this.createPrimaryActionButton('Canvas', 'codicon-new-file', 'roopik.openCanvas', true);
		const projectModeBtn = this.createSecondaryActionButton('Project', 'codicon-globe', 'roopik.openProjectPreview', true);

		// Separator
		const separator = document.createElement('div');
		separator.style.width = '1px';
		separator.style.height = '16px';
		separator.style.background = 'var(--vscode-sideBarSectionHeader-border, rgba(148, 163, 184, 0.35))';
		separator.style.margin = '0 4px';

		// Import button (smaller icon)
		const importBtn = this.createSecondaryActionButton('Import', 'codicon-cloud-download', 'roopik.import.showPicker', false);

		buttonsRow.appendChild(newCanvasBtn);
		buttonsRow.appendChild(projectModeBtn);
		buttonsRow.appendChild(separator);
		buttonsRow.appendChild(importBtn);
		actionsRow.appendChild(buttonsRow);

		container.appendChild(actionsRow);

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
		console.log('[RoopikDashboardView] loadCanvasesNow called');

		if (!this.canvasesContainer) {
			console.warn('[RoopikDashboardView] loadCanvasesNow: canvasesContainer is null');
			return;
		}

		// Clear existing content (use DOM API, not innerHTML due to TrustedTypes)
		while (this.canvasesContainer.firstChild) {
			this.canvasesContainer.removeChild(this.canvasesContainer.firstChild);
		}

		try {
			console.log('[RoopikDashboardView] Calling canvasService.listCanvasesAsync()...');
			const canvases = await this.canvasService.listCanvasesAsync();
			console.log(`[RoopikDashboardView] listCanvasesAsync returned ${canvases.length} canvases:`, canvases);

			if (canvases.length === 0) {
				console.log('[RoopikDashboardView] No canvases found, showing empty state');
				this.createSection(this.canvasesContainer, 'Canvases', [
					{ label: 'No canvases yet', description: 'Click "Canvas" to create one', onClick: () => { } }
				]);
				return;
			}

			// Convert to section items
			const items = canvases.map((canvas: CanvasMeta) => ({
				label: canvas.name,
				description: this.formatTimeAgo(canvas.updatedAt),
				onClick: () => this.openCanvas(canvas.id),
				onDelete: () => this.deleteCanvas(canvas.id, canvas.name),
				onRename: () => this.renameCanvas(canvas.id, canvas.name)
			}));

			console.log(`[RoopikDashboardView] Rendering ${items.length} canvas items`);
			this.createSection(this.canvasesContainer, 'Canvases', items);
		} catch (err) {
			console.error('[RoopikDashboardView] Failed to load canvases:', err);
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
				this.notificationService.info(localize('roopik.deleteCanvas.success', 'Canvas "{0}" deleted', canvasName));
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
				this.notificationService.info(localize('roopik.renameCanvas.success', 'Canvas renamed to "{0}"', newName));
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
	 * Load projects section (static placeholder for now)
	 */
	private loadProjects(): void {
		if (!this.projectsContainer) {
			return;
		}

		// Clear existing content
		while (this.projectsContainer.firstChild) {
			this.projectsContainer.removeChild(this.projectsContainer.firstChild);
		}

		// Static placeholder projects
		this.createSection(this.projectsContainer, 'Projects', [
			{ label: 'E-commerce App', description: 'React + Vite', onClick: () => { } },
			{ label: 'Dashboard UI', description: 'Next.js', onClick: () => { } }
		]);
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

	private createPrimaryActionButton(label: string, codiconClass: string, commandId: string, largeIcon: boolean = false): HTMLElement {
		const btn = document.createElement('button');
		btn.style.display = 'inline-flex';
		btn.style.alignItems = 'center';
		btn.style.justifyContent = 'center';
		btn.style.padding = '3px 10px';
		btn.style.borderRadius = '999px';
		btn.style.border = '1px solid var(--vscode-sideBarSectionHeader-border, rgba(148, 163, 184, 0.35))';
		btn.style.cursor = 'pointer';
		btn.style.fontSize = '11px';
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
		if (largeIcon) {
			icon.style.fontSize = '14px'; // Slightly larger for mode buttons
		}
		btn.appendChild(icon);

		const text = document.createElement('span');
		text.textContent = label;
		text.style.marginLeft = '4px';
		btn.appendChild(text);

		btn.onclick = () => {
			this.commandService.executeCommand(commandId);
		};

		return btn;
	}

	private createSecondaryActionButton(label: string, codiconClass: string, commandId: string, largeIcon: boolean = false): HTMLElement {
		const btn = document.createElement('button');
		btn.style.display = 'inline-flex';
		btn.style.alignItems = 'center';
		btn.style.justifyContent = 'center';
		btn.style.padding = '3px 10px';
		btn.style.borderRadius = '999px';
		btn.style.border = '1px solid var(--vscode-sideBarSectionHeader-border, rgba(148, 163, 184, 0.35))';
		btn.style.cursor = 'pointer';
		btn.style.fontSize = '11px';
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
		if (largeIcon) {
			icon.style.fontSize = '14px'; // Slightly larger for mode buttons
		}
		btn.appendChild(icon);

		const text = document.createElement('span');
		text.textContent = label;
		text.style.marginLeft = '4px';
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
		document.head.appendChild(style);
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
	order: 1,
	openCommandActionDescriptor: {
		id: ROOPIK_VIEWLET_ID,
		title: localize2('roopik', "Roopik"),
		mnemonicTitle: localize({ key: 'miViewRoopik', comment: ['&& denotes a mnemonic'] }, "&&Roopik"),
		keybindings: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR },
		order: 1
	},
}, ViewContainerLocation.Sidebar);
