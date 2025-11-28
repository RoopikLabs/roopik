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
import { IEditorService, SIDE_GROUP } from '../../../services/editor/common/editorService.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { ILifecycleService, LifecyclePhase, StartupKind } from '../../../services/lifecycle/common/lifecycle.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { RoopikWelcomeEditor } from './welcomeEditor.js';
import { RoopikWelcomeInput, RoopikWelcomeInputSerializer } from './welcomeInput.js';
import { RoopikViewsContribution } from './roopikViewPane.js';
import { RoopikLogger } from '../common/roopikLogger.js';
import { IOutputService } from '../../../services/output/common/output.js';
import { ILoggerService } from '../../../../platform/log/common/log.js';
import { Editor } from './projectMode/editor.js';
import { EditorTabInput } from './projectMode/editorTabInput.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IRoopikEventService, RoopikEventService } from '../common/events/index.js';
import { IRoopikSettingsService, RoopikSettingsService } from '../common/settings/index.js';
import { CanvasEditor } from './canvas/canvasEditor.js';
import { CanvasInput } from './canvas/canvasInput.js';

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
		Editor,
		Editor.ID,
		'Browser Preview'
	),
	[new SyncDescriptor(EditorTabInput)]
);

// Register Canvas Editor (Mode 1: Component Canvas)
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		CanvasEditor,
		CanvasEditor.ID,
		'Component Canvas'
	),
	[new SyncDescriptor(CanvasInput)]
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

// Open Canvas (Mode 1: Component Canvas)
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'roopik.openCanvas',
			title: localize2('roopik.openCanvas', 'Open Component Canvas'),
			category: localize2('roopik.category', 'Roopik'),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);

		// Get or create default canvas
		const canvasInput = CanvasInput.getInstance('default', 'Component Canvas');

		// Open canvas editor
		await editorService.openEditor(canvasInput, { pinned: true });
	}
});


// Open Browser Project Preview (Mode 2 with embedded DevTools) - SINGLETON
// Opens in RIGHT split by default to avoid blocking left-side menu items
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'roopik.openProjectPreview',
			title: localize2('roopik.openProjectPreview', 'Open Browser Preview'),
			category: localize2('roopik.category', 'Roopik'),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const notificationService = accessor.get(INotificationService);
		const storageService = accessor.get(IStorageService);

		// SINGLETON: Get the one and only browser instance
		const input = EditorTabInput.getInstance();

		// Check if browser editor is already open in any group
		// Use the singleton input directly since it's the same instance
		const visibleEditors = editorService.visibleEditorPanes;
		const existingPane = visibleEditors.find(
			pane => pane.input instanceof EditorTabInput
		);

		if (existingPane) {
			// Focus existing editor in its current group (don't create new split)
			await editorService.openEditor(input, { pinned: true }, existingPane.group);
			return;
		}

		// Open in RIGHT split (SIDE_GROUP) by default
		// This avoids blocking left-side menu items (File, Edit, View, etc.)
		await editorService.openEditor(input, { pinned: true }, SIDE_GROUP);

		// Show hint notification (once per installation)
		const hintKey = 'roopik.browserRightSideHintShown';
		const hintShown = storageService.getBoolean(hintKey, StorageScope.APPLICATION, false);

		if (!hintShown) {
			notificationService.notify({
				severity: Severity.Info,
				message: 'Tip: Keep browser on the right side to avoid blocking menu items.',
				sticky: false
			});
			storageService.store(hintKey, true, StorageScope.APPLICATION, 0 /* StorageTarget.USER */);
		}
	}
});

// Startup contribution to open welcome screen and clear output
class RoopikStartupContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'roopik.startupContribution';

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IStorageService private readonly storageService: IStorageService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IOutputService private readonly outputService: IOutputService
	) {
		super();
		this.clearOutputOnStartup();
		this.openWelcomeOnStartup();
	}

	/**
	 * Clear Roopik output channel on fresh startup (not on reload)
	 * This prevents old logs from previous sessions from cluttering the output
	 */
	private clearOutputOnStartup(): void {
		// Only clear on fresh startup, not on window reload
		if (this.lifecycleService.startupKind === StartupKind.ReloadedWindow) {
			return;
		}

		// Wait for output service to be ready
		this.lifecycleService.when(LifecyclePhase.Restored).then(() => {
			// Small delay to ensure output channels are fully initialized
			setTimeout(() => {
				const roopikChannel = this.outputService.getChannel(RoopikLogger.LOGGER_ID);
				if (roopikChannel) {
					roopikChannel.clear();
				}
			}, 100);
		});
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
