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
import './media/welcomeEditor.css';

export class RoopikWelcomeEditor extends EditorPane {
	static readonly ID = 'roopik.welcomeEditor';
	static readonly STORAGE_KEY = 'roopik.welcomeScreen.showOnStartup';

	private rootElement: HTMLElement | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService private readonly storageService: IStorageService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super(RoopikWelcomeEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		this.rootElement = parent;
		this.rootElement.classList.add('roopik-welcome');
		this.renderWelcomeScreen();
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
		const logo = $('img', {
			class: 'welcome-logo',
			src: FileAccess.asBrowserUri('vs/workbench/contrib/roopik/browser/media/roopik-logo.png').toString(true),
			alt: 'Roopik logo',
			draggable: 'false'
		});
		append(titleRow, logo);

		const title = append(titleRow, $('.welcome-title'));
		title.textContent = 'ROOPIK';

		const subtitle = append(heroContent, $('.welcome-subtitle'));
		subtitle.textContent = 'Visual canvas + Chromium DevTools + AI copilots';

		const heroDescription = append(heroContent, $('.hero-description'));
		heroDescription.textContent = 'Start designing components, preview production-ready UI, and collaborate with AI agents—all inside a single workspace.';

		const heroActions = append(heroContent, $('.hero-actions'));
		this.createHeroButton(heroActions, 'New Canvas', 'roopik.openCanvas', true);
		this.createHeroButton(heroActions, 'Open Project Preview', 'roopik.openProjectPreview');
		this.createHeroButton(heroActions, 'Browser Preview V2 (Beta)', 'roopik.openProjectPreviewV2');

		const heroShowcase = append(hero, $('.hero-showcase'));
		const showcaseLabel = append(heroShowcase, $('.showcase-label'));
		showcaseLabel.textContent = 'Live preview + DevTools';
		const showcaseHighlight = append(heroShowcase, $('.showcase-highlight'));
		showcaseHighlight.textContent = 'Preview, inspect, and edit with zero context switching.';

		// Quick start grid
		const quickStartSection = append(container, $('.welcome-section'));
		const quickStartTitle = append(quickStartSection, $('.section-title'));
		quickStartTitle.textContent = 'Quick start';

		const quickStartGrid = append(quickStartSection, $('.quick-start-grid'));
		const quickStartCards = [
			{ icon: '🎨', titleText: 'Canvas Mode', description: 'Infinite canvas for component-first workflows.', commandId: 'roopik.openCanvas' },
			{ icon: '🌐', titleText: 'Browser Preview', description: 'Full Chromium preview with click-to-source.', commandId: 'roopik.openProjectPreview' },
			{ icon: '🧪', titleText: 'Preview V2 (Beta)', description: 'Embedded DevTools + CDP integration.', commandId: 'roopik.openProjectPreviewV2' },
			{ icon: '⚡', titleText: 'Command Palette', description: 'Run any Roopik command instantly.', commandId: 'workbench.action.showCommands' }
		];

		for (const card of quickStartCards) {
			this.createQuickStartCard(quickStartGrid, card.icon, card.titleText, card.description, card.commandId);
		}

		// Highlights / tips
		const highlightsSection = append(container, $('.welcome-section'));
		const highlightsTitle = append(highlightsSection, $('.section-title'));
		highlightsTitle.textContent = 'Highlights';

		const highlightsList = append(highlightsSection, $('.tips-list'));
		const highlights = [
			{ icon: '🔍', titleText: 'Inspect Mode', description: 'Jump from DOM nodes to source and styles instantly.' },
			{ icon: '🤖', titleText: 'AI Automation', description: 'Coordinate multi-agent workflows across canvas + preview.' },
			{ icon: '🧭', titleText: 'Project Modes', description: 'Switch between Canvas, Browser, and DevTools views seamlessly.' },
			{ icon: '🔁', titleText: 'Live Sync', description: 'Hot reload Vite projects without leaving Roopik.' }
		];

		for (const item of highlights) {
			this.createTip(highlightsList, item.icon, item.titleText, item.description);
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

		const checkboxLabel = $('label.checkbox-label', { for: 'roopikShowOnStartup' }, 'Show welcome screen on startup');
		append(checkboxContainer, checkboxLabel);

		this._register(addDisposableListener(showOnStartupCheckbox, 'change', () => {
			this.storageService.store(
				RoopikWelcomeEditor.STORAGE_KEY,
				showOnStartupCheckbox.checked,
				StorageScope.PROFILE,
				StorageTarget.USER
			);
		}));
	}

	private createHeroButton(parent: HTMLElement, label: string, commandId: string, primary = false): void {
		const button = append(parent, primary ? $('.hero-button.primary') : $('.hero-button'));
		button.textContent = label;
		button.onclick = () => this.commandService.executeCommand(commandId);
	}

	private createQuickStartCard(parent: HTMLElement, icon: string, title: string, description: string, commandId: string): void {
		const card = append(parent, $('.quick-card'));

		const cardIcon = append(card, $('.quick-card-icon'));
		cardIcon.textContent = icon;

		const cardTitle = append(card, $('.quick-card-title'));
		cardTitle.textContent = title;

		const cardDescription = append(card, $('.quick-card-description'));
		cardDescription.textContent = description;

		const link = append(card, $('.quick-card-link'));
		link.textContent = 'Run command';

		card.onclick = () => {
			this.commandService.executeCommand(commandId);
		};
		link.onclick = (event) => {
			event.stopPropagation();
			this.commandService.executeCommand(commandId);
		};
	}

	private createTip(parent: HTMLElement, icon: string, title: string, description: string): void {
		const tip = append(parent, $('.tip-item'));

		const iconEl = append(tip, $('.tip-icon'));
		iconEl.textContent = icon;

		const content = append(tip, $('.tip-content'));

		const titleEl = append(content, $('.tip-title'));
		titleEl.textContent = title;

		const descEl = append(content, $('.tip-description'));
		descEl.textContent = description;
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
