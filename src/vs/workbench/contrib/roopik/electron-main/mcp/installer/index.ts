/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCP Installer Module
 *
 * Exports for auto-registration with external AI agents.
 * Exports for auto-registration with external AI agents.
 */

// Main installer
export { McpInstaller } from './mcpInstaller.js';
export type { McpPlatformAdapter } from './mcpInstaller.js';

// Types
export type {
	AiAgent,
	AgentInfo,
	McpServerEntry,
	ClaudeCodeConfig,
	ClaudeCliConfig,
	CursorConfig,
	InstallationResult,
	RegistrationStatus,
	InstallerOptions,
	McpIntegrationSettings
} from './mcpInstallerTypes.js';

// Constants
export { ROOPIK_MCP_NAME } from './mcpInstallerUtils.js';

// Utilities - Path resolution
export {
	isWindows,
	isMac,
	isLinux,
	getHomeDir,
	getAppDataDir,
	getMcpBinaryPath,
	getAgentConfigPath,
	getClaudeSettingsPath,
	isAgentInstalled
} from './mcpInstallerUtils.js';

// Utilities - CLI helpers
export {
	isCommandAvailable,
	executeCommand,
	getClaudeCodeBinaryPath,
	getCodexBinaryPath,
	buildClaudeExtensionAddCommand,
	buildClaudeExtensionRemoveCommand,
	buildGlobalClaudeAddCommand,
	buildGlobalClaudeRemoveCommand,
	buildCodexExtensionAddCommand,
	buildCodexExtensionRemoveCommand,
	buildGlobalCodexAddCommand,
	buildGlobalCodexRemoveCommand
} from './mcpInstallerUtils.js';

// Utilities - Claude allow rules (CRITICAL for auto-approval)
export {
	addClaudeAllowRule,
	removeClaudeAllowRule
} from './mcpInstallerUtils.js';

// Utilities - Config file operations
export {
	readJsonConfig,
	writeJsonConfig,
	backupConfig,
	generateMcpServerEntry,
	isRoopikRegistered,
	addRoopikToConfig,
	removeRoopikFromConfig
} from './mcpInstallerUtils.js';
