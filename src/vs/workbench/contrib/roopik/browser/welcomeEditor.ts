/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { $, append, clearNode, addDisposableListener } from '../../../../base/browser/dom.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { FileAccess } from '../../../../base/common/network.js';
import { IRoopikSettingsService } from '../common/settings/index.js';
import { RoopikWelcomeInput, WelcomeViewMode } from './welcomeInput.js';
import './media/welcomeEditor.css';

export class RoopikWelcomeEditor extends EditorPane {
	static readonly ID = 'roopik.welcomeEditor';
	static readonly STORAGE_KEY = 'roopik.welcomeScreen.showOnStartup';

	private rootElement: HTMLElement | undefined;

	// Current view mode (welcome screen or settings)
	private currentView: WelcomeViewMode = 'welcome';

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService private readonly storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService,
		@IRoopikSettingsService private readonly settingsService: IRoopikSettingsService
	) {
		super(RoopikWelcomeEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		this.rootElement = parent;
		this.rootElement.classList.add('roopik-welcome');
		this.renderCurrentView();
	}

	private renderCurrentView(): void {
		if (this.currentView === 'welcome') {
			this.renderWelcomeScreen();
		} else {
			this.renderSettingsView();
		}
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
		heroDescription.textContent = 'Start designing components, preview production-ready UI, and collaborate with AI agents— all inside a single workspace.';

		const heroActions = append(heroContent, $('.hero-actions'));
		this.createHeroButton(heroActions, 'codicon-new-file', 'New Canvas', 'roopik.openCanvas', true);
		this.createHeroButton(heroActions, 'codicon-globe', 'Project Mode', 'roopik.openProjectPreview');

		const heroShowcase = append(hero, $('.hero-showcase'));
		const showcaseLabel = append(heroShowcase, $('.showcase-label'));
		showcaseLabel.textContent = 'Live preview + DevTools';
		const showcaseHighlight = append(heroShowcase, $('.showcase-highlight'));
		showcaseHighlight.textContent = 'Preview, inspect, and edit with zero context switching.';

		// Quick start section with two columns
		const quickStartSection = append(container, $('.welcome-section'));
		const quickStartTitle = append(quickStartSection, $('.section-title'));
		quickStartTitle.textContent = 'Quick start';

		const quickStartContainer = append(quickStartSection, $('.quick-start-container'));

		// Left column: Start actions
		const startColumn = append(quickStartContainer, $('.quick-start-column'));
		const startTitle = append(startColumn, $('.quick-start-column-title'));
		startTitle.textContent = 'Start';

		const startActions = [
			{ icon: 'codicon-new-file', label: 'New Canvas', commandId: 'roopik.openCanvas' },
			{ icon: 'codicon-folder', label: 'Open Canvas', commandId: 'roopik.openCanvas' },
			{ icon: 'codicon-file-symlink-directory', label: 'Import Canvas', commandId: 'roopik.openCanvas' },
			{ icon: 'codicon-globe', label: 'Project Mode', commandId: 'roopik.openProjectPreview' },
			{ icon: 'codicon-keyboard', label: 'Run Command...', commandId: 'workbench.action.showCommands' }
		];

		for (const action of startActions) {
			this.createQuickStartAction(startColumn, action.icon, action.label, action.commandId);
		}

		// Right column: Recent canvases
		const recentColumn = append(quickStartContainer, $('.quick-start-column'));
		const recentTitle = append(recentColumn, $('.quick-start-column-title'));
		recentTitle.textContent = 'Recent';

		// Placeholder canvases (will be dynamic later)
		const recentCanvases = [
			{ name: 'Dashboard Design', path: '~/Projects/dashboard.canvas' },
			{ name: 'Landing Page', path: '~/Projects/landing.canvas' }
		];

		if (recentCanvases.length > 0) {
			for (const canvas of recentCanvases) {
				this.createRecentCanvasItem(recentColumn, canvas.name, canvas.path);
			}
		} else {
			const emptyState = append(recentColumn, $('.quick-start-empty'));
			emptyState.textContent = 'No recent canvases';
		}

		// Footer with checkbox (sticky bar)
		const footer = append(this.rootElement, $('.welcome-footer'));
		const checkboxContainer = append(footer, $('.checkbox-container'));

		const toggleWrapper = $('label', { class: 'toggle-pill' });
		const showOnStartupCheckbox = $('input', {
			type: 'checkbox',
			id: 'roopikShowOnStartup',
			class: 'toggle-pill-input'
		}) as HTMLInputElement;
		showOnStartupCheckbox.checked = this.storageService.getBoolean(RoopikWelcomeEditor.STORAGE_KEY, StorageScope.PROFILE, true);
		append(toggleWrapper, showOnStartupCheckbox);
		append(toggleWrapper, $('.toggle-pill-slider'));
		append(checkboxContainer, toggleWrapper);

		const checkboxLabel = $('label.checkbox-label', { for: 'roopikShowOnStartup' }, 'Show on startup');
		append(checkboxContainer, checkboxLabel);

		// Settings button in footer (right side)
		const settingsButton = append(checkboxContainer, $('.settings-icon-button'));
		const settingsIcon = append(settingsButton, $('span.codicon.codicon-settings-gear'));
		settingsIcon.setAttribute('aria-hidden', 'true');
		settingsButton.title = 'Settings';
		this._register(addDisposableListener(settingsButton, 'click', () => this.showSettingsView()));

		this._register(addDisposableListener(showOnStartupCheckbox, 'change', () => {
			this.storageService.store(
				RoopikWelcomeEditor.STORAGE_KEY,
				showOnStartupCheckbox.checked,
				StorageScope.PROFILE,
				StorageTarget.USER
			);
		}));
	}

	// ============================================================================
	// Inline Settings View
	// ============================================================================

	private renderSettingsView(): void {
		if (!this.rootElement) {
			return;
		}

		clearNode(this.rootElement);

		const container = append(this.rootElement, $('.settings-view-container'));

		// Back button header (like VSCode walkthrough)
		const backHeader = append(container, $('.settings-back-header'));
		const backButton = append(backHeader, $('.settings-back-button'));
		const backIcon = append(backButton, $('span.codicon.codicon-arrow-left'));
		backIcon.setAttribute('aria-hidden', 'true');
		const backText = append(backButton, $('span.settings-back-text'));
		backText.textContent = 'Back to Welcome';
		this._register(addDisposableListener(backButton, 'click', () => this.showWelcomeView()));

		// Settings content wrapper
		const settingsWrapper = append(container, $('.settings-view-content'));

		// Settings header
		const header = append(settingsWrapper, $('.settings-view-header'));
		const headerTitle = append(header, $('.settings-view-title'));
		headerTitle.textContent = 'Roopik Settings';
		const headerDesc = append(header, $('.settings-view-description'));
		headerDesc.textContent = 'Configure browser preview, canvas, AI agent, and other preferences.';

		// Settings body with sections
		const body = append(settingsWrapper, $('.settings-view-body'));

		// Browser Settings Section
		this.createSettingsSection(body, 'Browser Preview', [
			{
				label: 'Default URL',
				description: 'The URL to load when opening a new browser preview',
				type: 'text',
				path: 'browser.defaultUrl',
				value: this.settingsService.get('browser.defaultUrl')
			},
			{
				label: 'Auto-refresh on Save',
				description: 'Automatically refresh the browser when files are saved',
				type: 'toggle',
				path: 'browser.autoRefreshOnSave',
				value: this.settingsService.get('browser.autoRefreshOnSave')
			},
			{
				label: 'Keyboard Shortcuts',
				description: 'Enable keyboard shortcuts in browser view',
				type: 'toggle',
				path: 'browser.enableKeyboardShortcuts',
				value: this.settingsService.get('browser.enableKeyboardShortcuts')
			}
		]);

		// Canvas Settings Section
		this.createSettingsSection(body, 'Canvas', [
			{
				label: 'Snap to Grid',
				description: 'Align components to the grid when moving',
				type: 'toggle',
				path: 'canvas.snapToGrid',
				value: this.settingsService.get('canvas.snapToGrid')
			},
			{
				label: 'Show Grid',
				description: 'Display grid lines on the canvas',
				type: 'toggle',
				path: 'canvas.showGrid',
				value: this.settingsService.get('canvas.showGrid')
			},
			{
				label: 'Grid Size',
				description: 'Grid cell size in pixels',
				type: 'number',
				path: 'canvas.gridSize',
				value: this.settingsService.get('canvas.gridSize'),
				min: 4,
				max: 64
			}
		]);

		// AI Agent Settings Section
		this.createSettingsSection(body, 'AI Agent', [
			{
				label: 'Enable AI Features',
				description: 'Enable AI-powered suggestions and automation',
				type: 'toggle',
				path: 'agent.enabled',
				value: this.settingsService.get('agent.enabled')
			},
			{
				label: 'Auto-apply Suggestions',
				description: 'Automatically apply AI suggestions without confirmation',
				type: 'toggle',
				path: 'agent.autoApplySuggestions',
				value: this.settingsService.get('agent.autoApplySuggestions')
			},
			{
				label: 'Show Activity Indicator',
				description: 'Display indicator when AI is processing',
				type: 'toggle',
				path: 'agent.showActivityIndicator',
				value: this.settingsService.get('agent.showActivityIndicator')
			}
		]);

		// Welcome Screen Settings Section
		this.createSettingsSection(body, 'Welcome Screen', [
			{
				label: 'Show Tips',
				description: 'Display tips and highlights on the welcome screen',
				type: 'toggle',
				path: 'welcome.showTips',
				value: this.settingsService.get('welcome.showTips')
			}
		]);
	}

	private showSettingsView(): void {
		this.currentView = 'settings';
		this.renderCurrentView();
	}

	private showWelcomeView(): void {
		this.currentView = 'welcome';
		this.renderCurrentView();
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
	 * Create a recent canvas item
	 */
	private createRecentCanvasItem(parent: HTMLElement, name: string, path: string): void {
		const item = append(parent, $('.recent-canvas-item'));

		const nameEl = append(item, $('.recent-canvas-name'));
		nameEl.textContent = name;

		const pathEl = append(item, $('.recent-canvas-path'));
		pathEl.textContent = path;

		// Placeholder click handler (will be implemented when canvas system is ready)
		item.onclick = () => {
			// TODO: Open canvas when implemented
			this.commandService.executeCommand('roopik.openCanvas');
		};
	}

	override async setInput(input: EditorInput, options: undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);

		// Read view mode from input
		if (input instanceof RoopikWelcomeInput) {
			this.currentView = input.viewMode;
		}

		if (this.rootElement) {
			this.renderCurrentView();
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

	// ============================================================================
	// Settings Controls
	// ============================================================================

	/**
	 * Create a settings section with items
	 */
	private createSettingsSection(
		parent: HTMLElement,
		title: string,
		items: Array<{
			label: string;
			description: string;
			type: 'toggle' | 'text' | 'number' | 'select';
			path: string;
			value: unknown;
			options?: Array<{ value: string; label: string }>;
			min?: number;
			max?: number;
		}>
	): void {
		const section = append(parent, $('.settings-section'));

		const sectionTitle = append(section, $('.settings-section-title'));
		sectionTitle.textContent = title;

		for (const item of items) {
			const settingItem = append(section, $('.settings-item'));

			const labelContainer = append(settingItem, $('.settings-item-label'));
			const labelEl = append(labelContainer, $('.settings-item-name'));
			labelEl.textContent = item.label;
			const descEl = append(labelContainer, $('.settings-item-desc'));
			descEl.textContent = item.description;

			const controlContainer = append(settingItem, $('.settings-item-control'));

			switch (item.type) {
				case 'toggle':
					this.createToggleControl(controlContainer, item.path, item.value as boolean);
					break;
				case 'text':
					this.createTextControl(controlContainer, item.path, item.value as string);
					break;
				case 'number':
					this.createNumberControl(controlContainer, item.path, item.value as number, item.min, item.max);
					break;
				case 'select':
					this.createSelectControl(controlContainer, item.path, item.value as string, item.options || []);
					break;
			}
		}
	}

	/**
	 * Create a toggle switch control
	 */
	private createToggleControl(parent: HTMLElement, path: string, value: boolean): void {
		const toggle = append(parent, $(`.settings-toggle${value ? '.active' : ''}`));
		// Add slider element for the toggle animation
		append(toggle, $('.settings-toggle-slider'));

		this._register(addDisposableListener(toggle, 'click', () => {
			const newValue = !toggle.classList.contains('active');
			toggle.classList.toggle('active', newValue);
			// Update setting using the settings service
			// Cast path to the correct type for type-safe access
			this.settingsService.set(path as 'browser.autoRefreshOnSave', newValue as never);
		}));
	}

	/**
	 * Create a text input control
	 */
	private createTextControl(parent: HTMLElement, path: string, value: string): void {
		const input = $('input.settings-text-input', {
			type: 'text',
			value: value
		}) as HTMLInputElement;
		append(parent, input);

		this._register(addDisposableListener(input, 'change', () => {
			this.settingsService.set(path as 'browser.defaultUrl', input.value as never);
		}));
	}

	/**
	 * Create a number input control
	 */
	private createNumberControl(parent: HTMLElement, path: string, value: number, min?: number, max?: number): void {
		const input = $('input.settings-number-input', {
			type: 'number',
			value: String(value),
			min: min !== undefined ? String(min) : undefined,
			max: max !== undefined ? String(max) : undefined
		}) as HTMLInputElement;
		append(parent, input);

		this._register(addDisposableListener(input, 'change', () => {
			const numValue = parseInt(input.value, 10);
			if (!isNaN(numValue)) {
				this.settingsService.set(path as 'canvas.gridSize', numValue as never);
			}
		}));
	}

	/**
	 * Create a select dropdown control
	 */
	private createSelectControl(parent: HTMLElement, path: string, value: string, options: Array<{ value: string; label: string }>): void {
		const select = $('select.settings-select') as HTMLSelectElement;
		for (const option of options) {
			const optionEl = $('option', { value: option.value }) as HTMLOptionElement;
			optionEl.textContent = option.label;
			if (option.value === value) {
				optionEl.selected = true;
			}
			append(select, optionEl);
		}
		append(parent, select);

		this._register(addDisposableListener(select, 'change', () => {
			this.settingsService.set(path as 'browser.devToolsMode', select.value as never);
		}));
	}
}
