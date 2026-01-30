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
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';

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
	RoopikComponentContribution,
	RoopikProjectModeContribution
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
import { IProjectStorageService } from '../common/projectStorage/index.js';
import { ProjectStorageServiceClient } from './projectStorageServiceClient.js';
import { IMcpServerService } from '../common/mcp/index.js';
import { McpServerServiceClient } from './mcpServerServiceClient.js';
// MenubarStateService - registers singleton for browser pause detection
import './services/menubarStateService.js';

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
// Configuration Registration
// ============================================================================

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'roopik',
	order: 1,
	title: 'Roopik IDE',
	type: 'object',
	properties: {
		// ========================================
		// General Settings
		// ========================================
		'roopik.general.showWelcomeOnStartup': {
			type: 'boolean',
			default: true,
			order: 1,
			description: 'Show the Roopik welcome screen on startup.'
		},

		// ========================================
		// MCP Server - Core Settings (logical order)
		// ========================================
		'roopik.mcp.stdioMCP': {
			type: 'boolean',
			default: true,
			order: 10,
			markdownDescription: '**Enable STDIO MCP** [Recommended] - Allow AI agents (Claude, Codex, etc.) to control Roopik IDE via the standard STDIO-based MCP protocol.'
		},
		'roopik.mcp.stdioMCPPort': {
			type: 'number',
			default: 9876,
			minimum: 1024,
			maximum: 65535,
			order: 11,
			description: 'AI agents connect to this port for STDIO-based communication.'
		},
		'roopik.mcp.autoRegister': {
			type: 'boolean',
			default: true,
			order: 12,
			description: 'Automatically register Roopik with enabled AI agents on startup.'
		},
		'roopik.mcp.cleanupOnExit': {
			type: 'boolean',
			default: false,
			order: 13,
			description: 'Unregister from all AI agents when Roopik exits. If false, registrations persist for quick reconnection.'
		},
		'roopik.mcp.httpMCP': {
			type: 'boolean',
			default: false,
			order: 14,
			markdownDescription: '**Enable HTTP/SSE MCP** (Experimental) - Enable HTTP-based MCP transport with Server-Sent Events.'
		},
		'roopik.mcp.httpMCPPort': {
			type: 'number',
			default: 3333,
			minimum: 1024,
			maximum: 65535,
			order: 15,
			description: 'Only used when HTTP/SSE MCP is enabled.'
		},

		// ========================================
		// MCP Agent Integrations (individual toggles)
		// ========================================
		'roopik.mcp.agents.claudeCli': {
			type: 'boolean',
			default: true,
			order: 20,
			description: 'Register with Claude CLI (global command). Allows Claude CLI to control Roopik IDE.'
		},
		'roopik.mcp.agents.claudeCode': {
			type: 'boolean',
			default: true,
			order: 21,
			description: 'Register with Claude Code VS Code extension. Allows Claude Code to control Roopik IDE.'
		},
		'roopik.mcp.agents.codex': {
			type: 'boolean',
			default: false,
			order: 22,
			description: 'Register with Codex VS Code extension. Allows Codex to control Roopik IDE.'
		},
		'roopik.mcp.agents.codexCli': {
			type: 'boolean',
			default: false,
			order: 23,
			description: 'Register with Codex CLI (global command). Allows Codex CLI to control Roopik IDE.'
		},
		'roopik.mcp.agents.cursor': {
			type: 'boolean',
			default: false,
			order: 24,
			description: 'Register with Cursor IDE. Allows Cursor AI to control Roopik IDE.'
		},
		'roopik.mcp.agents.gemini': {
			type: 'boolean',
			default: false,
			order: 25,
			description: 'Register with Google Gemini. Allows Gemini to control Roopik IDE.'
		},
		'roopik.mcp.agents.windsurf': {
			type: 'boolean',
			default: false,
			order: 26,
			description: 'Register with Windsurf IDE. Allows Windsurf AI to control Roopik IDE.'
		},

		// ========================================
		// Browser Settings
		// ========================================
		'roopik.browser.attachElementScreenshot': {
			type: 'boolean',
			default: true,
			order: 30,
			markdownDescription: '**Include Screenshot in Inspect Mode** - When attaching an element to AI chat, also capture a screenshot of the element along with its HTML context.'
		},

		// ========================================
		// Canvas Settings
		// ========================================
		'roopik.canvas.snapToGrid': {
			type: 'boolean',
			default: true,
			order: 35,
			description: 'Align components to the grid when moving.'
		},
		'roopik.canvas.showGrid': {
			type: 'boolean',
			default: true,
			order: 36,
			description: 'Display grid lines on the canvas.'
		},
		'roopik.canvas.gridSize': {
			type: 'number',
			default: 8,
			minimum: 4,
			maximum: 64,
			order: 37,
			description: 'Grid cell size in pixels.'
		},

		// ========================================
		// Project Settings
		// ========================================
		'roopik.project.rememberRecent': {
			type: 'boolean',
			default: true,
			order: 40,
			description: 'Remember recently opened projects.'
		},
		'roopik.project.maxRecentProjects': {
			type: 'number',
			default: 10,
			minimum: 1,
			maximum: 50,
			order: 41,
			description: 'Maximum number of recent projects to remember.'
		}
	}
});

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

// Project Mode: Auto-open browser when dev server starts
registerWorkbenchContribution2(
	RoopikProjectModeContribution.ID,
	RoopikProjectModeContribution,
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

// Project Storage Service (recent projects for Project Mode)
// Browser-side client that communicates with ProjectStorageService in main process via IPC
registerSingleton(IProjectStorageService, ProjectStorageServiceClient, InstantiationType.Delayed);

// MCP Server Service (AI agent integration control)
// Browser-side client that communicates with McpServerService in main process via IPC
registerSingleton(IMcpServerService, McpServerServiceClient, InstantiationType.Delayed);
