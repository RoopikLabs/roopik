/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Roopik Settings System - Public Exports
 */

// Service
export { IRoopikSettingsService, RoopikSettingsService, SettingsChangeEvent } from './roopikSettingsService.js';

// Types
export {
	// App Settings
	RoopikAppSettings,
	BrowserSettings,
	CanvasSettings,
	WelcomeSettings,
	AgentSettings,

	// Workspace Settings
	RoopikWorkspaceSettings,
	WorkspaceBrowserConfig,
	WorkspaceComponentConfig,

	// Defaults
	DEFAULT_APP_SETTINGS,
	DEFAULT_BROWSER_SETTINGS,
	DEFAULT_CANVAS_SETTINGS,
	DEFAULT_WELCOME_SETTINGS,
	DEFAULT_AGENT_SETTINGS,
	DEFAULT_WORKSPACE_SETTINGS,
	DEFAULT_WORKSPACE_BROWSER_CONFIG,
	DEFAULT_WORKSPACE_COMPONENT_CONFIG,

	// Type helpers
	AppSettingsPath,
	WorkspaceSettingsPath,
	SettingValue
} from './roopikSettingsTypes.js';
