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
import { Toggle } from '../../../../base/browser/ui/toggle/toggle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { defaultToggleStyles } from '../../../../platform/theme/browser/defaultStyles.js';
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

		// Header
		const header = append(container, $('.welcome-header'));
		const logo = append(header, $('.welcome-logo'));
		logo.textContent = '🎨';

		const title = append(header, $('.welcome-title'));
		title.textContent = 'Roopik';

		const subtitle = append(header, $('.welcome-subtitle'));
		subtitle.textContent = 'Design-First IDE with AI';

		// Actions
		const actions = append(container, $('.welcome-actions'));

		this.createActionButton(
			actions,
			'New Canvas',
			'Create a new component canvas',
			'roopik.openCanvas'
		);

		this.createActionButton(
			actions,
			'Open Project Preview',
			'Preview your project in browser',
			'roopik.openProjectPreview'
		);

		this.createActionButton(
			actions,
			'Browser Preview V2 (Beta)',
			'Preview with embedded DevTools & CDP',
			'roopik.openProjectPreviewV2'
		);

		// Getting started
		const gettingStarted = append(container, $('.welcome-section'));
		const sectionTitle = append(gettingStarted, $('.section-title'));
		sectionTitle.textContent = 'Getting Started';

		const tips = append(gettingStarted, $('.tips-list'));

		this.createTip(tips, '📦', 'Mode 1: Canvas', 'Build components visually on an infinite canvas');
		this.createTip(tips, '🌐', 'Mode 2: Browser Preview', 'Preview projects with real Chromium DevTools');
		this.createTip(tips, '🔍', 'Inspect Mode', 'Click elements to see styles, jump to source (HTML + CSS)');
		this.createTip(tips, '🤖', 'AI Integration', 'Every feature is callable by AI agents');

		// Footer with checkbox
		const footer = append(container, $('.welcome-footer'));

		const checkboxContainer = append(footer, $('.checkbox-container'));

		const showOnStartupCheckbox = new Toggle({
			icon: Codicon.check,
			actionClassName: 'roopik-checkbox',
			isChecked: this.storageService.getBoolean(RoopikWelcomeEditor.STORAGE_KEY, StorageScope.PROFILE, true),
			title: 'Show welcome screen on startup',
			...defaultToggleStyles
		});
		showOnStartupCheckbox.domNode.id = 'roopikShowOnStartup';

		const checkboxLabel = $('label.checkbox-label', { for: 'roopikShowOnStartup' }, 'Show welcome screen on startup');

		this._register(showOnStartupCheckbox);
		this._register(showOnStartupCheckbox.onChange(() => {
			this.storageService.store(
				RoopikWelcomeEditor.STORAGE_KEY,
				showOnStartupCheckbox.checked,
				StorageScope.PROFILE,
				StorageTarget.USER
			);
		}));

		this._register(addDisposableListener(checkboxLabel, 'click', () => {
			showOnStartupCheckbox.checked = !showOnStartupCheckbox.checked;
			this.storageService.store(
				RoopikWelcomeEditor.STORAGE_KEY,
				showOnStartupCheckbox.checked,
				StorageScope.PROFILE,
				StorageTarget.USER
			);
		}));

		append(checkboxContainer, showOnStartupCheckbox.domNode);
		append(checkboxContainer, checkboxLabel);

		const shortcutHint = append(footer, $('.shortcut-hint'));
		shortcutHint.textContent = 'Press F1 to see all Roopik commands';
	}

	private createActionButton(parent: HTMLElement, label: string, description: string, commandId: string): void {
		const button = append(parent, $('.action-button'));

		const labelEl = append(button, $('.action-label'));
		labelEl.textContent = label;

		const descEl = append(button, $('.action-description'));
		descEl.textContent = description;

		button.onclick = () => {
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
