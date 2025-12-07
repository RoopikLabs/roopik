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
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { RoopikWelcomeEditor } from './welcomeEditor.js';
import { RoopikWelcomeInput, RoopikWelcomeInputSerializer } from './welcomeInput.js';
import { RoopikViewsContribution } from './roopikViewPane.js';
import { RoopikLogger } from '../common/roopikLogger.js';
import { IOutputService } from '../../../services/output/common/output.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { Editor } from './projectMode/editor.js';
import { EditorTabInput } from './projectMode/editorTabInput.js';
import { EditorTabInputSerializer } from './projectMode/editorTabInputSerializer.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IRoopikEventService, RoopikEventService } from '../common/events/index.js';
import { IRoopikSettingsService, RoopikSettingsService } from '../common/settings/index.js';
import { ICanvasService } from '../common/canvas/index.js';
import { CanvasServiceClient } from './canvasServiceClient.js';
import { IComponentService } from '../common/component/componentService.js';
import { ComponentServiceClient } from './componentServiceClient.js';

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
// Creates canvas via CanvasService, which handles everything (create + open)
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
		const canvasService = accessor.get(ICanvasService);
		const notificationService = accessor.get(INotificationService);

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

		try {
			// Single call: CanvasService handles create + triggers extension to open
			const result = await canvasService.createCanvas(canvasName);

			// Just show notification based on result
			if (!result.isNew) {
				notificationService.info(
					localize('roopik.canvas.exists', 'Opening existing canvas: {0}', result.canvas.name)
				);
			}
			// Canvas is opened via onCanvasCreated event subscription (see below)

		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			notificationService.error(
				localize('roopik.canvas.createError', 'Failed to create canvas: {0}', errorMsg)
			);
		}
	}
});

// Import Component - Show source picker
// Shows options: Local File (active), GitHub, Figma, Third-party (coming soon)
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'roopik.import.showPicker',
			title: localize2('roopik.import.showPicker', 'Import Component'),
			category: localize2('roopik.category', 'Roopik'),
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		// Get all services upfront - accessor is only valid synchronously
		const quickInputService = accessor.get(IQuickInputService);
		const canvasService = accessor.get(ICanvasService);
		const componentService = accessor.get(IComponentService);
		const notificationService = accessor.get(INotificationService);
		const commandService = accessor.get(ICommandService);
		const fileDialogService = accessor.get(IFileDialogService);

		// Check if we have an active canvas, otherwise let user select one
		let targetCanvasId = await canvasService.getFocusedCanvasIdAsync();

		if (!targetCanvasId) {
			// No canvas focused - get list of existing canvases
			const allCanvases = await canvasService.listCanvasesAsync();

			if (allCanvases.length === 0) {
				// No canvases exist - prompt to create one
				const shouldCreate = await quickInputService.pick([
					{ label: '$(add) Create New Canvas', id: 'create' },
					{ label: '$(close) Cancel', id: 'cancel' }
				], {
					title: localize('roopik.import.noCanvas.title', 'No Canvases Found'),
					placeHolder: localize('roopik.import.noCanvas.placeholder', 'Create a canvas first to import components')
				});

				if (shouldCreate?.id === 'create') {
					await commandService.executeCommand('roopik.openCanvas');
				}
				return;
			}

			// Show list of existing canvases to select from
			const canvasItems = [
				...allCanvases.map(canvas => ({
					label: `$(symbol-class) ${canvas.name}`,
					id: canvas.id,
					description: `${canvas.componentCount || 0} components`,
					detail: canvas.description || undefined
				})),
				{ label: '$(add) Create New Canvas', id: 'create', description: '' }
			];

			const selectedCanvas = await quickInputService.pick(canvasItems, {
				title: localize('roopik.import.selectCanvas.title', 'Select Target Canvas'),
				placeHolder: localize('roopik.import.selectCanvas.placeholder', 'Choose a canvas to import the component into')
			});

			if (!selectedCanvas) {
				return;
			}

			if (selectedCanvas.id === 'create') {
				await commandService.executeCommand('roopik.openCanvas');
				return;
			}

			targetCanvasId = selectedCanvas.id;
		}

		// At this point we have a targetCanvasId
		const canvasId = targetCanvasId;

		// Show import source picker
		const importSources = [
			{
				label: '$(file-code) Local File',
				id: 'local-file',
				description: 'Import from your project files',
				detail: 'Browse and select a React, Vue, or Svelte component file'
			},
			{
				label: '$(github) GitHub',
				id: 'github',
				description: 'Coming Soon',
				detail: 'Import components from public GitHub repositories'
			},
			{
				label: '$(symbol-color) Figma',
				id: 'figma',
				description: 'Coming Soon',
				detail: 'Convert Figma designs to React components'
			},
			{
				label: '$(package) Third-party Libraries',
				id: 'third-party',
				description: 'Coming Soon',
				detail: 'Import from npm packages like shadcn/ui, Chakra, etc.'
			},
			{
				label: '$(edit) Create Blank Component',
				id: 'manual',
				description: 'Start with a template',
				detail: 'Create a new component from scratch'
			}
		];

		const selectedSource = await quickInputService.pick(importSources, {
			title: localize('roopik.import.title', 'Import Component'),
			placeHolder: localize('roopik.import.placeholder', 'Select an import source')
		});

		if (!selectedSource) {
			return;
		}

		// Handle each source type
		switch (selectedSource.id) {
			case 'local-file': {
				// Use native file dialog to select component files
				const uris = await fileDialogService.showOpenDialog({
					title: localize('roopik.import.localFile.title', 'Select Component File'),
					canSelectFiles: true,
					canSelectFolders: false,
					canSelectMany: false,
					openLabel: localize('roopik.import.localFile.openLabel', 'Import'),
					filters: [
						{
							name: localize('roopik.import.filter.react', 'React Components'),
							extensions: ['tsx', 'jsx']
						},
						{
							name: localize('roopik.import.filter.vue', 'Vue Components'),
							extensions: ['vue']
						},
						{
							name: localize('roopik.import.filter.svelte', 'Svelte Components'),
							extensions: ['svelte']
						},
						{
							name: localize('roopik.import.filter.all', 'All Components'),
							extensions: ['tsx', 'jsx', 'vue', 'svelte', 'ts', 'js']
						}
					]
				});

				if (!uris || uris.length === 0) {
					return;
				}

				const selectedUri = uris[0];
				const filePath = selectedUri.fsPath;

				try {
					// Extract component name from file path
					const fileName = filePath.split(/[\\/]/).pop() || 'Component';
					const componentName = fileName.replace(/\.[^/.]+$/, '');

					// Create component via ComponentService
					await componentService.createComponent({
						name: componentName,
						canvasId: canvasId,
						source: 'local-file',
						sourceData: {
							type: 'local-file',
							filePath: filePath
						}
					});

					notificationService.info(
						localize('roopik.import.success', 'Importing component: {0}', componentName)
					);
				} catch (err) {
					const errorMsg = err instanceof Error ? err.message : String(err);
					notificationService.error(
						localize('roopik.import.error', 'Failed to import: {0}', errorMsg)
					);
				}
				break;
			}

			case 'manual': {
				// Create blank component
				const componentName = await quickInputService.input({
					title: localize('roopik.import.manual.title', 'Create Blank Component'),
					prompt: localize('roopik.import.manual.prompt', 'Enter a name for your component'),
					placeHolder: localize('roopik.import.manual.placeholder', 'e.g., MyComponent'),
					validateInput: async (value: string) => {
						if (!value || !value.trim()) {
							return localize('roopik.import.manual.required', 'Component name is required');
						}
						// PascalCase validation
						if (!/^[A-Z][a-zA-Z0-9]*$/.test(value)) {
							return localize('roopik.import.manual.invalidName', 'Use PascalCase (e.g., MyComponent)');
						}
						return undefined;
					}
				});

				if (!componentName) {
					return;
				}

				try {
					await componentService.createComponent({
						name: componentName,
						canvasId: canvasId,
						source: 'manual',
						sourceData: {
							type: 'manual',
							framework: 'react',
							template: 'basic'
						}
					});

					notificationService.info(
						localize('roopik.import.created', 'Creating component: {0}', componentName)
					);
				} catch (err) {
					const errorMsg = err instanceof Error ? err.message : String(err);
					notificationService.error(
						localize('roopik.import.error', 'Failed to create: {0}', errorMsg)
					);
				}
				break;
			}

			case 'github':
			case 'figma':
			case 'third-party':
				notificationService.info(
					localize('roopik.import.comingSoon', '{0} import is coming soon!', selectedSource.label.replace(/\$\([^)]+\)\s*/, ''))
				);
				break;
		}
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

// Startup contribution to open welcome screen, clear output, and initialize services
class RoopikStartupContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'roopik.startupContribution';

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@IStorageService private readonly storageService: IStorageService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IOutputService private readonly outputService: IOutputService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ICanvasService private readonly canvasService: ICanvasService,
		@IComponentService private readonly componentService: IComponentService
	) {
		super();
		this.clearOutputOnStartup();
		this.openWelcomeOnStartup();
		this.initializeRoopikServices();
	}

	/**
	 * Initialize Roopik services with workspace path
	 * This is required before any canvas/component operations can work
	 */
	private async initializeRoopikServices(): Promise<void> {
		await this.lifecycleService.when(LifecyclePhase.Restored);

		// Get workspace folder
		const workspace = this.workspaceContextService.getWorkspace();
		if (!workspace.folders || workspace.folders.length === 0) {
			console.warn('[RoopikStartupContribution] No workspace folder found, services not initialized');
			return;
		}

		const workspacePath = workspace.folders[0].uri.fsPath;
		console.log('[RoopikStartupContribution] Initializing services with workspace:', workspacePath);

		try {
			// Initialize Canvas Service
			await this.canvasService.initialize(workspacePath);
			console.log('[RoopikStartupContribution] CanvasService initialized');

			// Initialize Component Service
			await this.componentService.initialize(workspacePath);
			console.log('[RoopikStartupContribution] ComponentService initialized');
		} catch (err) {
			console.error('[RoopikStartupContribution] Failed to initialize services:', err);
		}
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

// Canvas event handler - bridges CanvasService events to Extension commands
class RoopikCanvasContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'roopik.canvasContribution';

	constructor(
		@ICanvasService private readonly canvasService: ICanvasService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super();

		// Open panel when canvas is created (or existing canvas requested)
		this._register(this.canvasService.onCanvasCreated(async (event) => {
			await this.commandService.executeCommand('roopik.canvas.open', {
				canvasId: event.canvasId,
				canvasName: event.canvas.name
			});
		}));

		// Close panel when canvas is deleted
		this._register(this.canvasService.onCanvasDeleted(async (event) => {
			await this.commandService.executeCommand('roopik.canvas.close', event.canvasId);
		}));

		// Update panel title when canvas is renamed
		this._register(this.canvasService.onCanvasUpdated(async (event) => {
			if (event.changes.includes('name')) {
				await this.commandService.executeCommand('roopik.canvas.update', {
					canvasId: event.canvasId,
					canvasName: event.canvas.name
				});
			}
		}));
	}
}

registerWorkbenchContribution2(RoopikCanvasContribution.ID, RoopikCanvasContribution, WorkbenchPhase.AfterRestored);

// ============================================================================
// Panel State Commands (called by Extension to notify Core)
// These allow Extension to inform Core about panel open/close/focus state
// ============================================================================

// Extension notifies Core when a canvas panel is opened
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'roopik.core.registerPanelOpen',
			title: localize2('roopik.core.registerPanelOpen', 'Register Panel Open'),
			category: localize2('roopik.category', 'Roopik'),
			f1: false // Internal command, not shown in command palette
		});
	}

	async run(accessor: ServicesAccessor, canvasId: string): Promise<void> {
		if (!canvasId) {
			return;
		}
		const canvasService = accessor.get(ICanvasService);
		canvasService.registerPanelOpen(canvasId);
	}
});

// Extension notifies Core when a canvas panel is closed
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'roopik.core.registerPanelClosed',
			title: localize2('roopik.core.registerPanelClosed', 'Register Panel Closed'),
			category: localize2('roopik.category', 'Roopik'),
			f1: false
		});
	}

	async run(accessor: ServicesAccessor, canvasId: string): Promise<void> {
		if (!canvasId) {
			return;
		}
		const canvasService = accessor.get(ICanvasService);
		canvasService.registerPanelClosed(canvasId);
	}
});

// Extension notifies Core when a canvas panel gains focus
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'roopik.core.registerPanelFocused',
			title: localize2('roopik.core.registerPanelFocused', 'Register Panel Focused'),
			category: localize2('roopik.category', 'Roopik'),
			f1: false
		});
	}

	async run(accessor: ServicesAccessor, canvasId: string): Promise<void> {
		if (!canvasId) {
			return;
		}
		const canvasService = accessor.get(ICanvasService);
		canvasService.registerPanelFocused(canvasId);
	}
});

// Component event handler - bridges ComponentService events to Extension commands
class RoopikComponentContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'roopik.componentContribution';

	constructor(
		@IComponentService private readonly componentService: IComponentService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super();

		// Route component created events to extension
		this._register(this.componentService.onComponentCreated(async (event) => {
			await this.commandService.executeCommand('roopik.component.created', {
				componentId: event.component.id,
				canvasId: event.component.canvasId,
				component: event.component
			});
		}));

		// Route component built events to extension
		this._register(this.componentService.onComponentBuilt(async (event) => {
			await this.commandService.executeCommand('roopik.component.built', {
				componentId: event.componentId,
				canvasId: event.canvasId,
				success: event.success,
				result: event.result,
				errorInfo: event.errorInfo,
				trigger: event.trigger
			});
		}));

		// Route component deleted events to extension
		this._register(this.componentService.onComponentDeleted(async (event) => {
			await this.commandService.executeCommand('roopik.component.deleted', {
				componentId: event.componentId,
				canvasId: event.canvasId
			});
		}));

		// Route component updated events to extension
		this._register(this.componentService.onComponentUpdated(async (event) => {
			await this.commandService.executeCommand('roopik.component.updated', {
				componentId: event.component.id,
				canvasId: event.component.canvasId,
				component: event.component,
				changes: event.changes
			});
		}));
	}
}

registerWorkbenchContribution2(RoopikComponentContribution.ID, RoopikComponentContribution, WorkbenchPhase.AfterRestored);

// Register Roopik views (Activity Bar)
registerWorkbenchContribution2(RoopikViewsContribution.ID, RoopikViewsContribution, WorkbenchPhase.BlockStartup);

// ============================================================================
// Service Registration
// ============================================================================

// Register Event Service (central pub/sub for all Roopik events)
registerSingleton(IRoopikEventService, RoopikEventService, InstantiationType.Delayed);

// Register Settings Service (persistence + configuration management)
registerSingleton(IRoopikSettingsService, RoopikSettingsService, InstantiationType.Delayed);

// Register Canvas Service (canvas CRUD, panel state tracking)
// This is the browser-side client that communicates with CanvasService in main process via IPC
registerSingleton(ICanvasService, CanvasServiceClient, InstantiationType.Delayed);

// Register Component Service (component CRUD, build, file watching)
// This is the browser-side client that communicates with ComponentService in main process via IPC
registerSingleton(IComponentService, ComponentServiceClient, InstantiationType.Delayed);
