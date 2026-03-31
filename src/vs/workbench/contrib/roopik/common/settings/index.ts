/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Roopik Settings System - Public Exports
 */

// Service (runtime values)
export { IRoopikSettingsService, RoopikSettingsService } from './roopikSettingsService.js';
export type { SettingsChangeEvent } from './roopikSettingsService.js';

// Defaults (runtime values)
export {
	DEFAULT_APP_SETTINGS,
	DEFAULT_BROWSER_SETTINGS,
	DEFAULT_CANVAS_SETTINGS,
	DEFAULT_WELCOME_SETTINGS,
	DEFAULT_AGENT_SETTINGS,
	DEFAULT_WORKSPACE_SETTINGS,
	DEFAULT_WORKSPACE_BROWSER_CONFIG,
	DEFAULT_WORKSPACE_COMPONENT_CONFIG
} from './roopikSettingsTypes.js';

// Types (type-only re-exports)
export type {
	RoopikAppSettings,
	BrowserSettings,
	CanvasSettings,
	WelcomeSettings,
	AgentSettings,
	RoopikWorkspaceSettings,
	WorkspaceBrowserConfig,
	WorkspaceComponentConfig,
	AppSettingsPath,
	WorkspaceSettingsPath,
	SettingValue
} from './roopikSettingsTypes.js';
