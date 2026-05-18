/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { $, append, clearNode, addDisposableListener } from '../../../../base/browser/dom.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { FileAccess } from '../../../../base/common/network.js';
import { ICanvasService } from '../common/canvas/index.js';
import { IProjectStorageService } from '../common/projectStorage/index.js';
import type { CanvasMeta } from '../common/canvas/types.js';
import type { ProjectInfo } from '../common/storage/storageTypes.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import './media/welcomeEditor.css';

export class RoopikWelcomeEditor extends EditorPane {
	static readonly ID = 'roopik.welcomeEditor';
	static readonly STORAGE_KEY = 'roopik.welcomeScreen.showOnStartup';

	private rootElement: HTMLElement | undefined;

	// Containers for dynamic content
	private recentCanvasesContainer: HTMLElement | undefined;
	private recentProjectsContainer: HTMLElement | undefined;

	// Loading guards to prevent concurrent loads
	private isLoadingCanvases: boolean = false;
	private isLoadingProjects: boolean = false;

	/** Timeout handle for project loading */
	private projectLoadingTimeoutHandle: ReturnType<typeof setTimeout> | undefined;
	/** Whether project service is initialized */
	private projectServiceInitialized: boolean = false;
	/** Loading timeout (5 seconds) */
	private static readonly LOADING_TIMEOUT_MS = 5000;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService,
		@ICanvasService private readonly canvasService: ICanvasService,
		@IProjectStorageService private readonly projectStorageService: IProjectStorageService,
		@IViewsService private readonly viewsService: IViewsService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super(RoopikWelcomeEditor.ID, group, telemetryService, themeService, storageService);

		// Subscribe to service events to auto-refresh
		this._register(this.canvasService.onDidInitialize(() => this.loadRecentCanvases()));
		this._register(this.canvasService.onCanvasCreated(() => this.loadRecentCanvases()));
		this._register(this.canvasService.onCanvasDeleted(() => this.loadRecentCanvases()));
		this._register(this.canvasService.onCanvasUpdated(() => this.loadRecentCanvases()));

		this._register(this.projectStorageService.onDidInitialize(() => {
			this.projectServiceInitialized = true;
			this.clearProjectLoadingTimeout();
			this.loadRecentProjects();
		}));
		this._register(this.projectStorageService.onProjectsChanged(() => this.loadRecentProjects()));
	}

	protected createEditor(parent: HTMLElement): void {
		this.rootElement = parent;
		this.rootElement.classList.add('roopik-welcome');
		this.renderWelcomeScreen();

		// Auto-open the Dio agent sidebar after a short delay
		// This ensures the extension is activated and webview is mounted
		// before the user tries to send their first message
		setTimeout(() => {
			// Show the auxiliary bar (right sidebar) first
			this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			// Then open the chat panel view
			this.viewsService.openView('roopik-zoo.ChatPanel', false).catch(() => {
				// Agent not available - ignore silently
			});
		}, 1500);
	}

	private renderWelcomeScreen(): void {
		if (!this.rootElement) {
			return;
		}

		clearNode(this.rootElement);

		const container = append(this.rootElement, $('.welcome-container'));

		const hero = append(container, $('.welcome-hero'));

		const heroContent = append(hero, $('.hero-content'));

		const heroBadge = append(heroContent, $('.hero-badge'));
		heroBadge.textContent = 'Design-first workspace';
		const titleRow = append(heroContent, $('.welcome-title-row'));
		const title = append(titleRow, $('.welcome-title'));
		title.textContent = 'ROOPIK';

		const logo = $('img', {
			class: 'welcome-logo',
			src: FileAccess.asBrowserUri('vs/workbench/contrib/roopik/browser/media/roopik-logo.png').toString(true),
			alt: 'Roopik logo',
			draggable: 'false'
		});
		append(titleRow, logo);

		const subtitle = append(heroContent, $('.welcome-subtitle'));
		subtitle.textContent = 'Visual canvas + AI copilots';

		const heroDescription = append(heroContent, $('.hero-description'));
		// allow-any-unicode-next-line
		heroDescription.textContent = 'Start designing components, preview production-ready UI, and collaborate with AI agents— all inside a single workspace.';

		const heroActions = append(heroContent, $('.hero-actions'));
		this.createHeroButton(heroActions, 'codicon-new-file', 'New Canvas', 'roopik.openCanvas', true);
		// Project button opens file explorer directly (folder icon)
		this.createHeroButton(heroActions, 'codicon-folder', 'Open Project', 'roopik.openProjectPicker', true);

		const heroShowcase = append(hero, $('.hero-showcase'));
		const showcaseLabel = append(heroShowcase, $('.showcase-label'));
		showcaseLabel.textContent = 'Live preview + DevTools';
		const showcaseHighlight = append(heroShowcase, $('.showcase-highlight'));
		showcaseHighlight.textContent = 'Preview, inspect, and edit with zero context switching.';

		// AI Input Section (between hero and quick start)
		const aiInputSection = append(container, $('.ai-input-section'));
		const aiInputWrapper = append(aiInputSection, $('.ai-input-wrapper'));
		const aiInputBox = append(aiInputWrapper, $('.ai-input-box'));

		// Input field - fills the whole container
		const aiInput = $('input', {
			type: 'text',
			class: 'ai-input-field',
			placeholder: 'What do you want to build today?',
			'aria-label': 'AI creation prompt'
		}) as HTMLInputElement;
		append(aiInputBox, aiInput);

		// Submit button
		const aiSubmitButton = append(aiInputBox, $('.ai-submit-button'));
		const arrowIcon = append(aiSubmitButton, $('span.codicon.codicon-arrow-right'));
		arrowIcon.setAttribute('aria-hidden', 'true');
		aiSubmitButton.title = 'Send to AI';

		// Event handlers for AI input
		this._register(addDisposableListener(aiInput, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && aiInput.value.trim()) {
				this.submitAiPrompt(aiInput.value.trim());
				aiInput.value = '';
			}
		}));

		this._register(addDisposableListener(aiSubmitButton, 'click', () => {
			if (aiInput.value.trim()) {
				this.submitAiPrompt(aiInput.value.trim());
				aiInput.value = '';
			}
		}));

		// Quick start section - two column layout with hover panel
		const quickStartSection = append(container, $('.welcome-section'));
		const quickStartTitle = append(quickStartSection, $('.section-title'));
		quickStartTitle.textContent = 'Quick start';

		const quickStartContainer = append(quickStartSection, $('.quick-start-container'));

		// Left column: Start actions
		const startColumn = append(quickStartContainer, $('.quick-start-column'));

		const startActions = [
			{ icon: 'codicon-new-file', label: 'New Canvas', commandId: 'roopik.openCanvas' },
			{ icon: 'codicon-folder-opened', label: 'Open Canvas', commandId: 'roopik.openCanvas' },
			{ icon: 'codicon-file-symlink-directory', label: 'Import Canvas', commandId: 'roopik.import.showPicker' },
			{ icon: 'codicon-folder', label: 'Open Project', commandId: 'roopik.openProjectPicker' },
			{ icon: 'codicon-globe', label: 'Browse Web', commandId: 'roopik.openProjectPreview' },
			{ icon: 'codicon-keyboard', label: 'Run Command...', commandId: 'workbench.action.showCommands' }
		];

		for (const action of startActions) {
			this.createQuickStartAction(startColumn, action.icon, action.label, action.commandId);
		}

		// Divider before recent items
		const divider = append(startColumn, $('.quick-start-divider'));
		divider.setAttribute('aria-hidden', 'true');

		// Right column: Hover panel for recent items (hidden by default)
		const hoverPanel = append(quickStartContainer, $('.quick-start-hover-panel'));
		hoverPanel.style.display = 'none';

		// Container for dynamic content inside hover panel
		this.recentCanvasesContainer = append(hoverPanel, $('.recent-items-container'));
		this.recentProjectsContainer = append(hoverPanel, $('.recent-items-container'));

		// Recent Canvases action with arrow (hover/click to show panel)
		this.createRecentItemTrigger(startColumn, 'codicon-layers', 'Recent Canvases', hoverPanel, 'canvases');

		// Recent Projects action with arrow (hover/click to show panel)
		this.createRecentItemTrigger(startColumn, 'codicon-folder-library', 'Recent Projects', hoverPanel, 'projects');

		// Preload data (check if already initialized)
		this.checkAndLoadCanvases();
		this.checkAndLoadProjects();

		// Footer removed - "Show on startup" setting now available in VS Code Settings (roopik.general.showWelcomeOnStartup)
	}

	/**
	 * Submit AI prompt to roopik-roo extension
	 *
	 * Strategy: Use IViewsService.openView() to open the secondary sidebar (right side)
	 *
	 * IViewsService.openView() is the correct VS Code API that:
	 * 1. Activates the extension that contributes the view
	 * 2. Waits for the view to be created and visible
	 * 3. Returns the view instance (or null if failed)
	 *
	 * We open roopik-zoo.ChatPanel (right side auxiliary bar) instead of
	 * roopik-zoo.SidebarProvider (left activity bar) as the preferred default.
	 */
	private async submitAiPrompt(promptText: string): Promise<void> {
		try {
			// Use IViewsService to open the ChatPanel in the secondary sidebar (right side)
			// This activates the extension and waits for the view to be ready
			const view = await this.viewsService.openView('roopik-zoo.ChatPanel', true);

			if (!view) {
				console.debug('AI agent view not available');
				return;
			}

			// Wait for webview to fully mount and initialize
			// (the webview sends 'webviewDidLaunch' message when ready,
			// but we can't listen for it from here, so we use a delay)
			await new Promise(resolve => setTimeout(resolve, 500));

			// Now send the message - webview should be ready
			await this.commandService.executeCommand('roopik-zoo.externalContext', {
				promptText: promptText,
				autoSend: true,
			});
		} catch (error) {
			console.debug('AI agent not available:', error);
		}
	}

	private createHeroButton(parent: HTMLElement, iconClass: string, label: string, commandId: string, primary = false): void {
		const button = append(parent, primary ? $('.hero-button.primary') : $('.hero-button'));

		const icon = append(button, $('span.codicon'));
		icon.classList.add(iconClass);
		icon.setAttribute('aria-hidden', 'true');

		const labelEl = append(button, $('.hero-button-label'));
		labelEl.textContent = label;

		button.onclick = () => this.commandService.executeCommand(commandId);
	}

	/**
	 * Create a quick start action item (VS Code style - icon + text)
	 */
	private createQuickStartAction(parent: HTMLElement, iconClass: string, label: string, commandId: string): void {
		const action = append(parent, $('.quick-start-action'));

		const icon = append(action, $('span.codicon'));
		icon.classList.add(iconClass);
		icon.setAttribute('aria-hidden', 'true');

		const labelEl = append(action, $('.quick-start-action-label'));
		labelEl.textContent = label;

		action.onclick = () => {
			this.commandService.executeCommand(commandId);
		};
	}

	/**
	 * Create a recent item trigger (hover/click to show panel)
	 */
	private createRecentItemTrigger(parent: HTMLElement, iconClass: string, label: string, hoverPanel: HTMLElement, type: 'canvases' | 'projects'): void {
		const action = append(parent, $('.quick-start-action.with-arrow'));

		const icon = append(action, $('span.codicon'));
		icon.classList.add(iconClass);
		icon.setAttribute('aria-hidden', 'true');

		const labelEl = append(action, $('.quick-start-action-label'));
		labelEl.textContent = label;

		const arrow = append(action, $('span.codicon.codicon-chevron-right.action-arrow'));
		arrow.setAttribute('aria-hidden', 'true');

		// Show panel on hover
		this._register(addDisposableListener(action, 'mouseenter', () => {
			this.showHoverPanel(hoverPanel, type);
		}));

		// Also handle click for accessibility
		action.onclick = () => {
			this.showHoverPanel(hoverPanel, type);
		};

		// Hide panel when mouse leaves the entire quick-start area
		const quickStartContainer = hoverPanel.parentElement;
		if (quickStartContainer) {
			this._register(addDisposableListener(quickStartContainer, 'mouseleave', () => {
				hoverPanel.style.display = 'none';
			}));
		}
	}

	/**
	 * Show hover panel with recent items
	 */
	private showHoverPanel(hoverPanel: HTMLElement, type: 'canvases' | 'projects'): void {
		hoverPanel.style.display = 'block';

		// Show the appropriate container, hide the other
		if (this.recentCanvasesContainer && this.recentProjectsContainer) {
			this.recentCanvasesContainer.style.display = type === 'canvases' ? 'block' : 'none';
			this.recentProjectsContainer.style.display = type === 'projects' ? 'block' : 'none';
		}
	}

	/**
	 * Create a recent canvas item
	 */
	private createRecentCanvasItem(parent: HTMLElement, canvas: CanvasMeta): void {
		const item = append(parent, $('.recent-canvas-item'));

		const nameEl = append(item, $('.recent-canvas-name'));
		nameEl.textContent = canvas.name;

		const pathEl = append(item, $('.recent-canvas-path'));
		pathEl.textContent = this.formatTimeAgo(canvas.updatedAt);

		item.onclick = () => {
			this.commandService.executeCommand('roopik.canvas.open', {
				canvasId: canvas.id,
				canvasName: canvas.name
			});
		};
	}

	/**
	 * Create a recent project item
	 */
	private createRecentProjectItem(parent: HTMLElement, project: ProjectInfo): void {
		const item = append(parent, $('.recent-canvas-item'));

		const nameEl = append(item, $('.recent-canvas-name'));
		nameEl.textContent = project.name;

		const pathEl = append(item, $('.recent-canvas-path'));
		// Build description: time + framework (if available)
		let description = this.formatTimeAgo(project.updatedAt);
		if (project.frameworkDisplayName) {
			description += ` • ${project.frameworkDisplayName}`;
		}
		pathEl.textContent = description;

		item.onclick = () => {
			this.commandService.executeCommand('roopik.openProjectPreview', {
				projectPath: project.path,
				projectName: project.name
			});
		};
	}

	// ============================================================================
	// Dynamic Loading Methods
	// ============================================================================

	/**
	 * Check if canvas service is initialized and load canvases
	 */
	private async checkAndLoadCanvases(): Promise<void> {
		try {
			const isInitialized = await this.canvasService.isInitializedAsync();
			if (isInitialized) {
				this.loadRecentCanvases();
			}
			// Otherwise wait for onDidInitialize event
		} catch (err) {
			// Service not ready - will retry via event
		}
	}

	/**
	 * Check if project storage service is initialized and load projects
	 */
	private async checkAndLoadProjects(): Promise<void> {
		try {
			const isInitialized = await this.projectStorageService.isInitializedAsync();
			if (isInitialized) {
				this.projectServiceInitialized = true;
				this.clearProjectLoadingTimeout();
				this.loadRecentProjects();
			} else {
				// Not initialized - start timeout
				this.startProjectLoadingTimeout();
			}
		} catch (err) {
			// Service not ready - will retry via event
			this.startProjectLoadingTimeout();
		}
	}

	/**
	 * Clear project loading timeout
	 */
	private clearProjectLoadingTimeout(): void {
		if (this.projectLoadingTimeoutHandle) {
			clearTimeout(this.projectLoadingTimeoutHandle);
			this.projectLoadingTimeoutHandle = undefined;
		}
	}

	/**
	 * Start project loading timeout
	 */
	private startProjectLoadingTimeout(): void {
		this.clearProjectLoadingTimeout();
		this.projectLoadingTimeoutHandle = setTimeout(() => {
			if (!this.projectServiceInitialized) {
				// Timeout - service initialization took too long
				this.showProjectTimeoutState();
			}
		}, RoopikWelcomeEditor.LOADING_TIMEOUT_MS);
	}

	/**
	 * Show timeout state for projects
	 */
	private showProjectTimeoutState(): void {
		if (!this.recentProjectsContainer) {
			return;
		}
		clearNode(this.recentProjectsContainer);
		// Add title
		const title = append(this.recentProjectsContainer, $('.hover-panel-title'));
		title.textContent = 'Recent Projects';
		const errorState = append(this.recentProjectsContainer, $('.quick-start-empty'));
		errorState.textContent = 'Open a workspace first';
	}

	/**
	 * Load recent canvases from CanvasService
	 */
	private async loadRecentCanvases(): Promise<void> {
		if (!this.recentCanvasesContainer) {
			return;
		}

		// Prevent concurrent loads
		if (this.isLoadingCanvases) {
			return;
		}
		this.isLoadingCanvases = true;

		try {
			// Clear existing content (use DOM API like activity panel)
			while (this.recentCanvasesContainer.firstChild) {
				this.recentCanvasesContainer.removeChild(this.recentCanvasesContainer.firstChild);
			}

			// Add title
			const title = append(this.recentCanvasesContainer, $('.hover-panel-title'));
			title.textContent = 'Recent Canvases';

			const canvases = await this.canvasService.listCanvasesAsync();

			if (canvases.length === 0) {
				const emptyState = append(this.recentCanvasesContainer, $('.quick-start-empty'));
				emptyState.textContent = 'No recent canvases';
				return;
			}

			// Deduplicate by canvas ID
			const uniqueCanvases = Array.from(
				new Map(canvases.map(canvas => [canvas.id, canvas])).values()
			);

			// Show up to 5 most recent canvases
			const recentCanvases = uniqueCanvases.slice(0, 5);
			for (const canvas of recentCanvases) {
				this.createRecentCanvasItem(this.recentCanvasesContainer, canvas);
			}
		} catch (err) {
			// Failed to load - show error state
			const errorState = append(this.recentCanvasesContainer, $('.quick-start-empty'));
			errorState.textContent = 'Failed to load canvases';
		} finally {
			this.isLoadingCanvases = false;
		}
	}

	/**
	 * Load recent projects from ProjectStorageService
	 */
	private async loadRecentProjects(): Promise<void> {
		if (!this.recentProjectsContainer) {
			return;
		}

		// Prevent concurrent loads
		if (this.isLoadingProjects) {
			return;
		}
		this.isLoadingProjects = true;

		try {
			// Clear existing content (use DOM API like activity panel)
			while (this.recentProjectsContainer.firstChild) {
				this.recentProjectsContainer.removeChild(this.recentProjectsContainer.firstChild);
			}

			// Add title
			const title = append(this.recentProjectsContainer, $('.hover-panel-title'));
			title.textContent = 'Recent Projects';

			const projects = await this.projectStorageService.getRecentProjects(5);

			if (projects.length === 0) {
				const emptyState = append(this.recentProjectsContainer, $('.quick-start-empty'));
				emptyState.textContent = 'No recent projects';
				return;
			}

			// Deduplicate by project path
			const uniqueProjects = Array.from(
				new Map(projects.map(project => [project.path, project])).values()
			);

			for (const project of uniqueProjects) {
				this.createRecentProjectItem(this.recentProjectsContainer, project);
			}
		} catch (err) {
			// Failed to load - show error state
			const errorState = append(this.recentProjectsContainer, $('.quick-start-empty'));
			errorState.textContent = 'Failed to load projects';
		} finally {
			this.isLoadingProjects = false;
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

	override async setInput(input: EditorInput, options: undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);

		if (this.rootElement) {
			this.renderWelcomeScreen();
		}
	}

	override clearInput(): void {
		if (this.rootElement) {
			clearNode(this.rootElement);
		}
		super.clearInput();
	}

	override layout(): void {
		// Responsive layout handled by CSS
	}
}
