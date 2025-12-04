/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Roopik Settings Types
 *
 * Defines all settings for the Roopik Design IDE.
 * Settings are split into two scopes:
 * - App Settings: User preferences (stored in VSCode's storage)
 * - Workspace Settings: Project-specific (stored in .roopik/config.json)
 */

// ============================================================================
// App Settings (User Profile)
// ============================================================================

/**
 * Browser preview settings
 */
export interface BrowserSettings {
	/** Default URL to open in new browser tabs */
	defaultUrl: string;
	/** Default DevTools mode: 'embedded', 'detached', or 'hidden' */
	devToolsMode: 'embedded' | 'detached' | 'hidden';
	/** DevTools split position (0-100 percentage) */
	devToolsSplitPosition: number;
	/** Enable keyboard shortcuts in browser view */
	enableKeyboardShortcuts: boolean;
	/** Auto-refresh on file changes */
	autoRefreshOnSave: boolean;
}

/**
 * Canvas settings
 */
export interface CanvasSettings {
	/** Default canvas zoom level */
	defaultZoom: number;
	/** Grid snap enabled */
	snapToGrid: boolean;
	/** Grid size in pixels */
	gridSize: number;
	/** Show grid lines */
	showGrid: boolean;
}

/**
 * Welcome screen settings
 */
export interface WelcomeSettings {
	/** Show welcome screen on startup */
	showOnStartup: boolean;
	/** Show tips in welcome screen */
	showTips: boolean;
}

/**
 * AI agent settings
 */
export interface AgentSettings {
	/** Enable AI agent features */
	enabled: boolean;
	/** Auto-apply agent suggestions */
	autoApplySuggestions: boolean;
	/** Show agent activity indicator */
	showActivityIndicator: boolean;
}

/**
 * All app-level settings
 */
export interface RoopikAppSettings {
	browser: BrowserSettings;
	canvas: CanvasSettings;
	welcome: WelcomeSettings;
	agent: AgentSettings;
}

// ============================================================================
// Workspace Settings (.roopik/config.json)
// ============================================================================

/**
 * Project-specific browser configuration
 */
export interface WorkspaceBrowserConfig {
	/** Project dev server URL */
	devServerUrl: string;
	/** Auto-detect dev server */
	autoDetectServer: boolean;
	/** Custom browser user agent */
	userAgent?: string;
}

/**
 * Component library configuration
 */
export interface WorkspaceComponentConfig {
	/** Path to component library */
	libraryPath: string;
	/** Component naming convention */
	namingConvention: 'PascalCase' | 'camelCase' | 'kebab-case';
}

/**
 * All workspace-level settings
 */
export interface RoopikWorkspaceSettings {
	browser: WorkspaceBrowserConfig;
	components: WorkspaceComponentConfig;
}

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_BROWSER_SETTINGS: BrowserSettings = {
	defaultUrl: 'about:blank',
	devToolsMode: 'embedded',
	devToolsSplitPosition: 70,
	enableKeyboardShortcuts: true,
	autoRefreshOnSave: true
};

export const DEFAULT_CANVAS_SETTINGS: CanvasSettings = {
	defaultZoom: 1,
	snapToGrid: true,
	gridSize: 8,
	showGrid: true
};

export const DEFAULT_WELCOME_SETTINGS: WelcomeSettings = {
	showOnStartup: true,
	showTips: true
};

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
	enabled: true,
	autoApplySuggestions: false,
	showActivityIndicator: true
};

export const DEFAULT_APP_SETTINGS: RoopikAppSettings = {
	browser: DEFAULT_BROWSER_SETTINGS,
	canvas: DEFAULT_CANVAS_SETTINGS,
	welcome: DEFAULT_WELCOME_SETTINGS,
	agent: DEFAULT_AGENT_SETTINGS
};

export const DEFAULT_WORKSPACE_BROWSER_CONFIG: WorkspaceBrowserConfig = {
	devServerUrl: 'http://localhost:3000',
	autoDetectServer: true
};

export const DEFAULT_WORKSPACE_COMPONENT_CONFIG: WorkspaceComponentConfig = {
	libraryPath: 'src/components',
	namingConvention: 'PascalCase'
};

export const DEFAULT_WORKSPACE_SETTINGS: RoopikWorkspaceSettings = {
	browser: DEFAULT_WORKSPACE_BROWSER_CONFIG,
	components: DEFAULT_WORKSPACE_COMPONENT_CONFIG
};

// ============================================================================
// Settings Paths (for type-safe access)
// ============================================================================

/**
 * Dot-notation paths for app settings
 */
export type AppSettingsPath =
	| 'browser.defaultUrl'
	| 'browser.devToolsMode'
	| 'browser.devToolsSplitPosition'
	| 'browser.enableKeyboardShortcuts'
	| 'browser.autoRefreshOnSave'
	| 'canvas.defaultZoom'
	| 'canvas.snapToGrid'
	| 'canvas.gridSize'
	| 'canvas.showGrid'
	| 'welcome.showOnStartup'
	| 'welcome.showTips'
	| 'agent.enabled'
	| 'agent.autoApplySuggestions'
	| 'agent.showActivityIndicator';

/**
 * Dot-notation paths for workspace settings
 */
export type WorkspaceSettingsPath =
	| 'browser.devServerUrl'
	| 'browser.autoDetectServer'
	| 'browser.userAgent'
	| 'components.libraryPath'
	| 'components.namingConvention';

/**
 * Get the value type for a given settings path
 */
export type SettingValue<P extends AppSettingsPath> =
	P extends 'browser.defaultUrl' ? string :
	P extends 'browser.devToolsMode' ? 'embedded' | 'detached' | 'hidden' :
	P extends 'browser.devToolsSplitPosition' ? number :
	P extends 'browser.enableKeyboardShortcuts' ? boolean :
	P extends 'browser.autoRefreshOnSave' ? boolean :
	P extends 'canvas.defaultZoom' ? number :
	P extends 'canvas.snapToGrid' ? boolean :
	P extends 'canvas.gridSize' ? number :
	P extends 'canvas.showGrid' ? boolean :
	P extends 'welcome.showOnStartup' ? boolean :
	P extends 'welcome.showTips' ? boolean :
	P extends 'agent.enabled' ? boolean :
	P extends 'agent.autoApplySuggestions' ? boolean :
	P extends 'agent.showActivityIndicator' ? boolean :
	never;
