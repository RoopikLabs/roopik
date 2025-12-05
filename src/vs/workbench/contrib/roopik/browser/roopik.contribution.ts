/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize, localize2 } from '../../../../nls.js';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IEditorGroupsService, preferredSideBySideGroupDirection } from '../../../services/editor/common/editorGroupsService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { ILifecycleService, LifecyclePhase, StartupKind } from '../../../services/lifecycle/common/lifecycle.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { RoopikWelcomeEditor } from './welcomeEditor.js';
import { RoopikWelcomeInput, RoopikWelcomeInputSerializer } from './welcomeInput.js';
import { RoopikViewsContribution } from './roopikViewPane.js';
import { RoopikLogger } from '../common/roopikLogger.js';
import { IOutputService } from '../../../services/output/common/output.js';
import { Editor } from './projectMode/editor.js';
import { EditorTabInput } from './projectMode/editorTabInput.js';
import { EditorTabInputSerializer } from './projectMode/editorTabInputSerializer.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IRoopikEventService, RoopikEventService } from '../common/events/index.js';
import { IRoopikSettingsService, RoopikSettingsService } from '../common/settings/index.js';
import { CanvasEditor } from './canvas/canvasEditor.js';
import { CanvasInput } from './canvas/canvasInput.js';
import { ISandboxPipelineService } from '../common/sandboxPipeline/sandboxPipelineService.js';
import { SandboxPipelineClient } from './sandboxPipelineClient.js';

// Import canvas commands (registers roopik.pipeline.* commands for extension use)
import './canvas/canvasCommands.js';

// Import import commands (registers roopik.import.* commands)
import './canvas/importCommands.js';

/**
 * Roopik Design IDE - Main Contribution
 *
 * Registers commands that are programmatically callable by:
 * - UI (command palette, keybindings)
 * - AI agents (tool calling)
 * - API (external integrations)
 */

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

// Register Browser Preview Serializer (for restore on reload)
// This enables VS Code to restore the browser preview with the same URL after window reload
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	EditorTabInput.ID,
	EditorTabInputSerializer
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
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const welcomeInput = RoopikWelcomeInput.getInstance('welcome');
		// Open in active group and focus on it
		await editorGroupsService.activeGroup.openEditor(welcomeInput, { pinned: true });
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
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const settingsInput = RoopikWelcomeInput.getInstance('settings');
		// Open in active group and focus on it
		await editorGroupsService.activeGroup.openEditor(settingsInput, { pinned: true });
	}
});

// Open Canvas (Mode 1: Component Canvas)
// Prompts for canvas name, then delegates to roopik-extension for WebviewPanel
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
		const quickInputService = accessor.get(IQuickInputService);
		const commandService = accessor.get(ICommandService);

		// Prompt for canvas name
		const canvasName = await quickInputService.input({
			title: localize('roopik.canvasName.title', 'New Canvas'),
			prompt: localize('roopik.canvasName.prompt', 'Enter a name for your canvas'),
			placeHolder: localize('roopik.canvasName.placeholder', 'e.g., Dashboard Components, Landing Page, etc.'),
			validateInput: async (value: string) => {
				if (!value || !value.trim()) {
					return localize('roopik.canvasName.required', 'Canvas name is required');
				}
				// Validate for valid folder name (no special chars except - and _)
				const invalidChars = /[<>:"/\\|?*]/;
				if (invalidChars.test(value)) {
					return localize('roopik.canvasName.invalidChars', 'Canvas name cannot contain: < > : " / \\ | ? *');
				}
				return undefined;
			}
		});

		// User cancelled
		if (!canvasName) {
			return;
		}

		// Delegate to extension with canvas name - WebviewPanel persists across tab switches!
		await commandService.executeCommand('roopik.canvas.open', canvasName.trim());
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
		const editorGroupsService = accessor.get(IEditorGroupsService);
		const configurationService = accessor.get(IConfigurationService);
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
			await existingPane.group.openEditor(input, { pinned: true });
			return;
		}

		// Open in side group (SIDE_GROUP) by default
		// This avoids blocking left-side menu items (File, Edit, View, etc.)
		// Resolve SIDE_GROUP to actual group (creates new group if needed)
		const direction = preferredSideBySideGroupDirection(configurationService);
		let targetGroup = editorGroupsService.findGroup({ direction });
		if (!targetGroup) {
			targetGroup = editorGroupsService.addGroup(editorGroupsService.activeGroup, direction);
		}
		await targetGroup.openEditor(input, { pinned: true });

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
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
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
				await this.editorGroupsService.activeGroup.openEditor(welcomeInput);
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
// Register Settings Service (persistence + configuration management)
registerSingleton(IRoopikSettingsService, RoopikSettingsService, InstantiationType.Delayed);

// Register Sandbox Pipeline Service (Client)
registerSingleton(ISandboxPipelineService, SandboxPipelineClient, InstantiationType.Delayed);
