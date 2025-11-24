/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorExtensions } from '../../../common/editor.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { ILifecycleService, LifecyclePhase, StartupKind } from '../../../services/lifecycle/common/lifecycle.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { RoopikWelcomeEditor } from './welcomeEditor.js';
import { RoopikWelcomeInput } from './welcomeInput.js';

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
		console.log('[Roopik] Core integration working! 🎨');
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
		const welcomeInput = RoopikWelcomeInput.getInstance();
		await editorService.openEditor(welcomeInput);
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

	async run(): Promise<void> {
		console.log('[Roopik] Canvas - Coming soon');
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

	async run(): Promise<void> {
		console.log('[Roopik] Project Preview - Coming soon');
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

		if (showOnStartup && this.lifecycleService.startupKind !== StartupKind.ReloadedWindow) {
			if (!this.editorService.activeEditor || this.layoutService.openedDefaultEditors) {
				const welcomeInput = RoopikWelcomeInput.getInstance();
				await this.editorService.openEditor(welcomeInput);
			}
		}
	}
}

registerWorkbenchContribution2(RoopikStartupContribution.ID, RoopikStartupContribution, WorkbenchPhase.AfterRestored);

console.log('[Roopik] Contribution loaded ✓');
