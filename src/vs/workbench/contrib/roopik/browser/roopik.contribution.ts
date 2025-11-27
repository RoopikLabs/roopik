/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { ILifecycleService, LifecyclePhase, StartupKind } from '../../../services/lifecycle/common/lifecycle.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { RoopikWelcomeEditor } from './welcomeEditor.js';
import { RoopikWelcomeInput, RoopikWelcomeInputSerializer } from './welcomeInput.js';
import { RoopikViewsContribution } from './roopikViewPane.js';
import { RoopikLogger } from '../common/roopikLogger.js';
import { ILoggerService } from '../../../../platform/log/common/log.js';
import { ProjectModeEditor } from './projectMode/projectModeEditor.js';
import { ProjectModeInput, ProjectModeInputSerializer } from './projectMode/projectModeInput.js';
import { ProjectModeV2Editor } from './projectModeV2/projectModeV2Editor.js';
import { ProjectModeV2Input } from './projectModeV2/projectModeV2Input.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IRoopikEventService, RoopikEventService } from '../common/events/index.js';
import { IRoopikSettingsService, RoopikSettingsService } from '../common/settings/index.js';

/**
 * Roopik Design IDE - Main Contribution
 *
 * Registers commands that are programmatically callable by:
 * - UI (command palette, keybindings)
 * - AI agents (tool calling)
 * - API (external integrations)
 */

// Test command
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'roopik.test',
			title: localize2('roopik.test', 'Test Core Integration'),
			category: localize2('roopik.category', 'Roopik'),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const loggerService = accessor.get(ILoggerService);
		const logger = RoopikLogger.create(loggerService);

		// Automatically logs to both Developer Console and Output Panel
		logger.info('[Roopik] Core integration working! 🎨');

		return Promise.resolve();
	}
});

// Register Welcome Screen Editor
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		RoopikWelcomeEditor,
		RoopikWelcomeEditor.ID,
		'Roopik Welcome'
	),
	[new SyncDescriptor(RoopikWelcomeInput)]
);

// Register Welcome Screen Serializer (for restore on reload)
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	RoopikWelcomeInput.ID,
	RoopikWelcomeInputSerializer
);

// Register Project Mode Editor (Mode 2: Browser Preview)
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		ProjectModeEditor,
		ProjectModeEditor.ID,
		'Project Preview'
	),
	[new SyncDescriptor(ProjectModeInput)]
);

// Register Project Mode Serializer (for restore on reload)
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	ProjectModeInput.ID,
	ProjectModeInputSerializer
);

// Register Project Mode V2 Editor (Mode 2: Browser Preview with embedded DevTools)
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		ProjectModeV2Editor,
		ProjectModeV2Editor.ID,
		'Browser Preview V2'
	),
	[new SyncDescriptor(ProjectModeV2Input)]
);

// Open Welcome Screen
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'roopik.openWelcome',
			title: localize2('roopik.openWelcome', 'Welcome'),
			category: localize2('roopik.category', 'Roopik'),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const welcomeInput = RoopikWelcomeInput.getInstance('welcome');
		// Open in new tab and focus on it
		await editorService.openEditor(welcomeInput, { pinned: true });
	}
});

// Open Settings (Preferences)
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'roopik.openSettings',
			title: localize2('roopik.openSettings', 'Settings'),
			category: localize2('roopik.category', 'Roopik'),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const settingsInput = RoopikWelcomeInput.getInstance('settings');
		// Open in new tab and focus on it
		await editorService.openEditor(settingsInput, { pinned: true });
	}
});

// Open Canvas (Mode 1)
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'roopik.openCanvas',
			title: localize2('roopik.openCanvas', 'Open Canvas'),
			category: localize2('roopik.category', 'Roopik'),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const loggerService = accessor.get(ILoggerService);
		const logger = RoopikLogger.create(loggerService);
		logger.debug('[Roopik] Canvas command invoked');
		logger.info('[Roopik] Canvas - Coming soon');
	}
});

// Open Project Preview (Mode 2)
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'roopik.openProjectPreview',
			title: localize2('roopik.openProjectPreview', 'Open Project Preview'),
			category: localize2('roopik.category', 'Roopik'),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const loggerService = accessor.get(ILoggerService);
		const editorService = accessor.get(IEditorService);
		const logger = RoopikLogger.create(loggerService);

		logger.debug('[Roopik] Project Preview command invoked');
		logger.info('[Roopik] Opening Project Preview editor');

		// Open Project Preview editor in new tab and focus on it
		const input = new ProjectModeInput('http://localhost:3000');
		await editorService.openEditor(input, { pinned: true });
	}
});

// Open Project Preview V2 (Mode 2 with embedded DevTools) - SINGLETON
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'roopik.openProjectPreviewV2',
			title: localize2('roopik.openProjectPreviewV2', 'Open Browser Preview V2 (Beta)'),
			category: localize2('roopik.category', 'Roopik'),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);

		// SINGLETON: Get the one and only browser instance
		// If tab already exists, this will focus it
		const input = ProjectModeV2Input.getInstance();
		await editorService.openEditor(input, { pinned: true });
	}
});

// Startup contribution to open welcome screen
class RoopikStartupContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'roopik.startupContribution';

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IStorageService private readonly storageService: IStorageService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService
	) {
		super();
		this.openWelcomeOnStartup();
	}

	private async openWelcomeOnStartup(): Promise<void> {
		await this.lifecycleService.when(LifecyclePhase.Restored);

		const showOnStartup = this.storageService.getBoolean(RoopikWelcomeEditor.STORAGE_KEY, StorageScope.PROFILE, true);

		// Open welcome screen on fresh startup only (not on reload)
		// VSCode automatically restores editors on reload, so welcome screen will restore if it was open
		if (showOnStartup && this.lifecycleService.startupKind !== StartupKind.ReloadedWindow) {
			if (!this.editorService.activeEditor || this.layoutService.openedDefaultEditors) {
				const welcomeInput = RoopikWelcomeInput.getInstance('welcome');
				await this.editorService.openEditor(welcomeInput);
			}
		}
	}
}

registerWorkbenchContribution2(RoopikStartupContribution.ID, RoopikStartupContribution, WorkbenchPhase.AfterRestored);

// Register Roopik views (Activity Bar)
registerWorkbenchContribution2(RoopikViewsContribution.ID, RoopikViewsContribution, WorkbenchPhase.BlockStartup);

// ============================================================================
// Service Registration
// ============================================================================

// Register Event Service (central pub/sub for all Roopik events)
registerSingleton(IRoopikEventService, RoopikEventService, InstantiationType.Delayed);

// Register Settings Service (persistence + configuration management)
registerSingleton(IRoopikSettingsService, RoopikSettingsService, InstantiationType.Delayed);
