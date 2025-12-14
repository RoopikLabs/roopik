/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Roopik Design IDE - Main Contribution
 *
 * This is the central entry point for registering all Roopik features.
 * It imports and registers:
 * - Editor panes and serializers
 * - Commands (via modular command files)
 * - Workbench contributions (via modular contribution files)
 * - Services (via DI registration)
 *
 * Architecture:
 * - commands/       - All command registrations (welcomeCommands, canvasCommands, etc.)
 * - contributions/  - All workbench contributions (startup, canvas events, component events)
 * - This file just imports and wires everything together
 */

import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

// ============================================================================
// Editor Imports
// ============================================================================
import { RoopikWelcomeEditor } from './welcomeEditor.js';
import { RoopikWelcomeInput, RoopikWelcomeInputSerializer } from './welcomeInput.js';
import { Editor } from './projectMode/editor.js';
import { EditorTabInput } from './projectMode/editorTabInput.js';
import { EditorTabInputSerializer } from './projectMode/editorTabInputSerializer.js';

// ============================================================================
// Command Imports (modular)
// ============================================================================
import { registerAllCommands } from './commands/index.js';

// ============================================================================
// Contribution Imports (modular)
// ============================================================================
import {
	RoopikStartupContribution,
	RoopikCanvasContribution,
	RoopikComponentContribution
} from './contributions/index.js';
import { RoopikViewsContribution } from './roopikViewPane.js';

// ============================================================================
// Service Imports
// ============================================================================
import { IRoopikEventService, RoopikEventService } from '../common/events/index.js';
import { IRoopikSettingsService, RoopikSettingsService } from '../common/settings/index.js';
import { ICanvasService } from '../common/canvas/index.js';
import { CanvasServiceClient } from './canvasServiceClient.js';
import { IComponentService } from '../common/component/componentService.js';
import { ComponentServiceClient } from './componentServiceClient.js';
import { ISourceNavigationService } from '../common/navigation/index.js';
import { SourceNavigationService } from './services/index.js';

// ============================================================================
// Editor Pane Registration
// ============================================================================

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
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(
	EditorTabInput.ID,
	EditorTabInputSerializer
);

// ============================================================================
// Command Registration
// ============================================================================

// Register all commands from modular command files
registerAllCommands();

// ============================================================================
// Workbench Contribution Registration
// ============================================================================

// Startup: Welcome screen, output clearing, service initialization
registerWorkbenchContribution2(
	RoopikStartupContribution.ID,
	RoopikStartupContribution,
	WorkbenchPhase.AfterRestored
);

// Canvas: Bridge CanvasService events to Extension commands
registerWorkbenchContribution2(
	RoopikCanvasContribution.ID,
	RoopikCanvasContribution,
	WorkbenchPhase.AfterRestored
);

// Component: Bridge ComponentService events to Extension commands
registerWorkbenchContribution2(
	RoopikComponentContribution.ID,
	RoopikComponentContribution,
	WorkbenchPhase.AfterRestored
);

// Views: Activity Bar registration
registerWorkbenchContribution2(
	RoopikViewsContribution.ID,
	RoopikViewsContribution,
	WorkbenchPhase.BlockStartup
);

// ============================================================================
// Service Registration
// ============================================================================

// Event Service (central pub/sub for all Roopik events)
registerSingleton(IRoopikEventService, RoopikEventService, InstantiationType.Delayed);

// Settings Service (persistence + configuration management)
registerSingleton(IRoopikSettingsService, RoopikSettingsService, InstantiationType.Delayed);

// Canvas Service (canvas CRUD, panel state tracking)
// Browser-side client that communicates with CanvasService in main process via IPC
registerSingleton(ICanvasService, CanvasServiceClient, InstantiationType.Delayed);

// Component Service (component CRUD, build, file watching)
// Browser-side client that communicates with ComponentService in main process via IPC
registerSingleton(IComponentService, ComponentServiceClient, InstantiationType.Delayed);

// Source Navigation Service (centralized file opening for click-to-source features)
// Used by: Style Inspect panel, Context menu "View Source", Element inspector
registerSingleton(ISourceNavigationService, SourceNavigationService, InstantiationType.Delayed);
