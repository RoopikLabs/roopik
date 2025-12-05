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
import { IFileService } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { Action } from '../../../../base/common/actions.js';

/**
 * Canvas metadata from .roopik/canvases.json
 */
interface CanvasMetadata {
	id: string;
	name: string;
	folderPath: string;
	createdAt: number;
	updatedAt: number;
}

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
	private fileWatcher: { dispose(): void } | undefined;
	private static animationsInjected = false;
	/** Track canvas signatures to detect actual list changes (not just timestamp updates) */
	private lastCanvasSignature: string = '';

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
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@INotificationService private readonly notificationService: INotificationService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
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

		// Top action bar (New Canvas, Project Mode)
		const actionsRow = document.createElement('div');
		actionsRow.style.display = 'flex';
		actionsRow.style.alignItems = 'center';
		actionsRow.style.justifyContent = 'flex-start';
		actionsRow.style.gap = '6px';
		actionsRow.style.marginBottom = '8px';

		const buttonsRow = document.createElement('div');
		buttonsRow.style.display = 'flex';
		buttonsRow.style.gap = '4px';
		buttonsRow.style.flexWrap = 'wrap';

		const newCanvasBtn = this.createPrimaryActionButton('Canvas', 'codicon-new-file', 'roopik.openCanvas');
		const importBtn = this.createSecondaryActionButton('Import', 'codicon-cloud-download', 'roopik.import.showPicker');
		const projectModeBtn = this.createSecondaryActionButton('Project', 'codicon-globe', 'roopik.openProjectPreview');

		buttonsRow.appendChild(newCanvasBtn);
		buttonsRow.appendChild(importBtn);
		buttonsRow.appendChild(projectModeBtn);
		actionsRow.appendChild(buttonsRow);

		container.appendChild(actionsRow);

		// Canvases Section (will be populated dynamically)
		this.canvasesContainer = document.createElement('div');
		container.appendChild(this.canvasesContainer);

		// Projects Section (separate container for future dynamic loading)
		this.projectsContainer = document.createElement('div');
		container.appendChild(this.projectsContainer);

		// Load canvases from file system
		this.loadCanvases();

		// Load projects (static for now)
		this.loadProjects();

		// Watch canvases.json for changes (auto-refresh on create/delete)
		this.setupFileWatcher();
	}

	/**
	 * Load canvases from .roopik/canvases.json
	 */
	private async loadCanvases(): Promise<void> {
		if (!this.canvasesContainer) {
			return;
		}

		// Clear existing content (use DOM API, not innerHTML due to TrustedTypes)
		while (this.canvasesContainer.firstChild) {
			this.canvasesContainer.removeChild(this.canvasesContainer.firstChild);
		}

		const workspace = this.workspaceContextService.getWorkspace();
		if (!workspace.folders || workspace.folders.length === 0) {
			this.lastCanvasSignature = '';
			this.createSection(this.canvasesContainer, 'Canvases', [
				{ label: 'No workspace open', description: 'Open a folder to create canvases', onClick: () => { } }
			]);
			return;
		}

		const workspaceFolder = workspace.folders[0];
		const canvasesJsonUri = URI.joinPath(workspaceFolder.uri, '.roopik', 'canvas', 'canvases.json');

		try {
			const content = await this.fileService.readFile(canvasesJsonUri);
			const data = JSON.parse(content.value.toString()) as { canvases: CanvasMetadata[] };

			// Update signature for change detection
			this.lastCanvasSignature = (data.canvases || [])
				.map(c => `${c.id}:${c.name}`)
				.sort()
				.join('|');

			if (data.canvases && data.canvases.length > 0) {
				const items = data.canvases.map(canvas => ({
					label: canvas.name,
					description: this.formatTimeAgo(canvas.updatedAt),
					onClick: () => this.openCanvas(canvas.name),
					onRename: () => this.renameCanvas(canvas),
					onDelete: () => this.deleteCanvas(canvas)
				}));
				this.createSection(this.canvasesContainer, 'Canvases', items);
			} else {
				this.createSection(this.canvasesContainer, 'Canvases', [
					{ label: 'No canvases yet', description: 'Click "Canvas" to create one', onClick: () => { } }
				]);
			}
		} catch {
			// File doesn't exist or can't be read
			this.lastCanvasSignature = '';
			this.createSection(this.canvasesContainer, 'Canvases', [
				{ label: 'No canvases yet', description: 'Click "Canvas" to create one', onClick: () => { } }
			]);
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
	 * Setup file watcher for canvases.json
	 * Only refreshes when canvas list actually changes (add/delete/rename), not on timestamp updates
	 */
	private setupFileWatcher(): void {
		const workspace = this.workspaceContextService.getWorkspace();
		if (!workspace.folders || workspace.folders.length === 0) {
			return;
		}

		const workspaceFolder = workspace.folders[0];
		const canvasesJsonUri = URI.joinPath(workspaceFolder.uri, '.roopik', 'canvas', 'canvases.json');

		// Dispose existing watcher if any
		if (this.fileWatcher) {
			this.fileWatcher.dispose();
		}

		// Watch for changes to canvases.json
		this.fileWatcher = this.fileService.watch(canvasesJsonUri);
		this._register({ dispose: () => this.fileWatcher?.dispose() });

		// Listen for file changes
		this._register(this.fileService.onDidFilesChange(async e => {
			// Check if canvases.json was affected
			if (e.affects(canvasesJsonUri)) {
				// Only refresh if the canvas list actually changed (not just timestamps)
				await this.checkAndRefreshCanvases(canvasesJsonUri);
			}
		}));
	}

	/**
	 * Check if canvas list changed and refresh only if needed
	 * Compares canvas IDs and names, ignores timestamp changes
	 */
	private async checkAndRefreshCanvases(canvasesJsonUri: URI): Promise<void> {
		try {
			const content = await this.fileService.readFile(canvasesJsonUri);
			const data = JSON.parse(content.value.toString()) as { canvases: CanvasMetadata[] };

			// Create signature from canvas IDs and names only (ignore timestamps)
			const newSignature = (data.canvases || [])
				.map(c => `${c.id}:${c.name}`)
				.sort()
				.join('|');

			// Only refresh if signature changed (canvas added, deleted, or renamed)
			if (newSignature !== this.lastCanvasSignature) {
				this.lastCanvasSignature = newSignature;
				this.loadCanvases();
			}
		} catch {
			// File might not exist yet - check if we had canvases before
			if (this.lastCanvasSignature !== '') {
				this.lastCanvasSignature = '';
				this.loadCanvases();
			}
		}
	}

	/**
	 * Open an existing canvas by name (bypasses name prompt)
	 * First validates that the canvas still exists on disk
	 */
	private async openCanvas(canvasName: string): Promise<void> {
		const workspace = this.workspaceContextService.getWorkspace();
		if (!workspace.folders || workspace.folders.length === 0) {
			return;
		}

		const workspaceFolder = workspace.folders[0];
		const canvasStateUri = URI.joinPath(workspaceFolder.uri, '.roopik', 'canvas', canvasName, 'canvas-state.json');

		try {
			// Validate canvas exists before opening
			await this.fileService.stat(canvasStateUri);
			// Canvas exists, open it
			this.commandService.executeCommand('roopik.canvas.open', canvasName);
		} catch {
			// Canvas doesn't exist anymore - refresh the list
			this.notificationService.warn(`Canvas "${canvasName}" no longer exists. Refreshing list...`);
			this.loadCanvases();
		}
	}

	/**
	 * Delete a canvas and its folder
	 */
	private async deleteCanvas(canvas: CanvasMetadata): Promise<void> {
		const workspace = this.workspaceContextService.getWorkspace();
		if (!workspace.folders || workspace.folders.length === 0) {
			return;
		}

		const workspaceFolder = workspace.folders[0];
		const canvasFolderUri = URI.joinPath(workspaceFolder.uri, '.roopik', 'canvas', canvas.name);
		const canvasesJsonUri = URI.joinPath(workspaceFolder.uri, '.roopik', 'canvas', 'canvases.json');

		try {
			// Close the editor tab if this canvas is open (via extension command)
			await this.commandService.executeCommand('roopik.canvas.close', canvas.name);

			// Delete the canvas folder
			await this.fileService.del(canvasFolderUri, { recursive: true });

			// Update canvases.json to remove this canvas
			const content = await this.fileService.readFile(canvasesJsonUri);
			const data = JSON.parse(content.value.toString()) as { canvases: CanvasMetadata[] };

			data.canvases = data.canvases.filter(c => c.id !== canvas.id);

			// Write updated canvases.json
			await this.fileService.writeFile(canvasesJsonUri, VSBuffer.fromString(JSON.stringify(data, null, 2)));

			// Refresh the list
			this.loadCanvases();

			this.notificationService.info(`Canvas "${canvas.name}" deleted.`);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			this.notificationService.error(`Failed to delete canvas: ${errorMsg}`);
		}
	}

	/**
	 * Rename a canvas
	 */
	private async renameCanvas(canvas: CanvasMetadata): Promise<void> {
		const workspace = this.workspaceContextService.getWorkspace();
		if (!workspace.folders || workspace.folders.length === 0) {
			return;
		}

		// Prompt for new name
		const newName = await this.quickInputService.input({
			title: localize('roopik.renameCanvas', 'Rename Canvas'),
			value: canvas.name,
			prompt: localize('roopik.renameCanvasPrompt', 'Enter a new name for the canvas'),
			validateInput: async (value) => {
				if (!value || value.trim().length === 0) {
					return localize('roopik.renameCanvasEmpty', 'Canvas name cannot be empty');
				}
				if (value.trim() === canvas.name) {
					return null; // Same name is OK (no-op)
				}
				// Check if name already exists
				const sanitized = value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
				const workspaceFolder = workspace.folders![0];
				const existingCanvasUri = URI.joinPath(workspaceFolder.uri, '.roopik', 'canvas', sanitized);
				try {
					await this.fileService.stat(existingCanvasUri);
					return localize('roopik.renameCanvasExists', 'A canvas with this name already exists');
				} catch {
					return null; // Doesn't exist, OK
				}
			}
		});

		if (!newName || newName.trim() === canvas.name) {
			return; // Cancelled or same name
		}

		const trimmedNewName = newName.trim();
		const workspaceFolder = workspace.folders[0];
		const oldFolderName = canvas.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
		const newFolderName = trimmedNewName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

		const oldCanvasFolderUri = URI.joinPath(workspaceFolder.uri, '.roopik', 'canvas', oldFolderName);
		const newCanvasFolderUri = URI.joinPath(workspaceFolder.uri, '.roopik', 'canvas', newFolderName);
		const canvasesJsonUri = URI.joinPath(workspaceFolder.uri, '.roopik', 'canvas', 'canvases.json');

		try {
			// Close the editor tab if this canvas is open
			await this.commandService.executeCommand('roopik.canvas.close', canvas.name);

			// Rename the folder
			await this.fileService.move(oldCanvasFolderUri, newCanvasFolderUri);

			// Update canvases.json
			const content = await this.fileService.readFile(canvasesJsonUri);
			const data = JSON.parse(content.value.toString()) as { canvases: CanvasMetadata[] };

			const canvasEntry = data.canvases.find(c => c.id === canvas.id);
			if (canvasEntry) {
				canvasEntry.name = trimmedNewName;
				canvasEntry.folderPath = newFolderName;
				canvasEntry.updatedAt = Date.now();
			}

			await this.fileService.writeFile(canvasesJsonUri, VSBuffer.fromString(JSON.stringify(data, null, 2)));

			// Update canvas-state.json inside the folder
			const canvasStateUri = URI.joinPath(newCanvasFolderUri, 'canvas-state.json');
			try {
				const stateContent = await this.fileService.readFile(canvasStateUri);
				const stateData = JSON.parse(stateContent.value.toString());
				stateData.name = trimmedNewName;
				stateData.updatedAt = Date.now();
				await this.fileService.writeFile(canvasStateUri, VSBuffer.fromString(JSON.stringify(stateData, null, 2)));
			} catch {
				// canvas-state.json might not exist yet
			}

			// Refresh the list
			this.loadCanvases();

			this.notificationService.info(`Canvas renamed to "${trimmedNewName}".`);
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			this.notificationService.error(`Failed to rename canvas: ${errorMsg}`);
		}
	}

	/**
	 * Format timestamp to relative time (e.g., "2 days ago")
	 */
	private formatTimeAgo(timestamp: number): string {
		const now = Date.now();
		const diff = now - timestamp;
		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) {
			return days === 1 ? '1 day ago' : `${days} days ago`;
		}
		if (hours > 0) {
			return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
		}
		if (minutes > 0) {
			return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
		}
		return 'Just now';
	}

	private createSection(container: HTMLElement, title: string, items: Array<{ label: string; description: string; onClick?: () => void; onRename?: () => void; onDelete?: () => void }>): HTMLElement {
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

			// Context menu for rename/delete (if either action is provided)
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

	private createPrimaryActionButton(label: string, codiconClass: string, commandId: string): HTMLElement {
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

	private createSecondaryActionButton(label: string, codiconClass: string, commandId: string): HTMLElement {
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
