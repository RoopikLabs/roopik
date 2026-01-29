/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCP Installer Module
 *
 * Exports for auto-registration with external AI agents.
 */

// Main installer
export { McpInstaller } from './mcpInstaller.js';

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

// Utilities
export {
	getAgentConfigPath,
	isAgentInstalled,
	getMcpBinaryPath,
	readJsonConfig,
	writeJsonConfig,
	backupConfig,
	generateMcpServerEntry,
	isRoopikRegistered,
	addRoopikToConfig,
	removeRoopikFromConfig,
	isWindows,
	isMac,
	isLinux,
	getHomeDir,
	getAppDataDir
} from './mcpInstallerUtils.js';
