/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCP Installer Utilities
 *
 * Helper functions for:
 * - Finding binary paths
 * - Locating agent config files
 * - Reading/writing JSON configs
 * - Platform-specific path resolution
 * - CLI command execution
 *
 * Platform-specific path resolution and CLI helpers.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { AiAgent, McpServerEntry } from './mcpInstallerTypes.js';

const execAsync = promisify(exec);

// ============================================================================
// Platform Detection
// ============================================================================

export const isWindows = process.platform === 'win32';
export const isMac = process.platform === 'darwin';
export const isLinux = process.platform === 'linux';

// ============================================================================
// Path Resolution
// ============================================================================

/**
 * Get the home directory
 */
export function getHomeDir(): string {
	return os.homedir();
}

/**
 * Get platform-specific app data directory
 */
export function getAppDataDir(): string {
	if (isWindows) {
		return process.env.APPDATA || path.join(getHomeDir(), 'AppData', 'Roaming');
	} else if (isMac) {
		return path.join(getHomeDir(), 'Library', 'Application Support');
	} else {
		return process.env.XDG_CONFIG_HOME || path.join(getHomeDir(), '.config');
	}
}

/**
 * Get the path to Roopik's MCP binary for the current platform
 */
export function getMcpBinaryPath(): string {
	const resourcesPath = getResourcesPath();

	if (isWindows) {
		return path.join(resourcesPath, 'mcp-binaries', 'roopik-mcp-win-x64.exe');
	} else if (isMac) {
		const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
		return path.join(resourcesPath, 'mcp-binaries', `roopik-mcp-macos-${arch}`);
	} else {
		return path.join(resourcesPath, 'mcp-binaries', 'roopik-mcp-linux-x64');
	}
}

/**
 * Get the resources path (where binaries are stored)
 */
function getResourcesPath(): string {
	// Try to get from electron app
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { app } = require('electron');
		if (app && app.isPackaged) {
			return path.join(app.getPath('resources'));
		}
	} catch {
		// Not in electron context
	}

	// Development fallback - find resources directory
	let currentDir = __dirname;
	for (let i = 0; i < 10; i++) {
		const resourcesDir = path.join(currentDir, 'resources');
		if (fs.existsSync(resourcesDir)) {
			return resourcesDir;
		}
		currentDir = path.dirname(currentDir);
	}

	// Final fallback
	return path.join(getHomeDir(), '.roopik', 'resources');
}

// ============================================================================
// Agent Config Paths
// ============================================================================

/**
 * Claude Code settings path (for permissions/allow rules)
 */
export function getClaudeSettingsPath(): string {
	return path.join(getHomeDir(), '.claude', 'settings.json');
}

/**
 * Get config file path for a specific agent
 * Get config file path for a specific agent
 */
export function getAgentConfigPath(agent: AiAgent): string {
	const home = getHomeDir();

	switch (agent) {
		case 'claude-code':
			// Claude Code uses CLI commands, settings are at ~/.claude/settings.json
			return getClaudeSettingsPath();

		case 'claude-cli':
			// Same path as claude-code
			return getClaudeSettingsPath();

		case 'cursor':
			return path.join(home, '.cursor', 'mcp.json');

		case 'windsurf':
			// ~/.codeium/windsurf/mcp_config.json
			return path.join(home, '.codeium', 'windsurf', 'mcp_config.json');

		case 'gemini':
			// ~/.gemini/settings.json
			return path.join(home, '.gemini', 'settings.json');

		case 'codex':
			// Codex extension uses CLI commands, no config file
			return path.join(home, '.codex', 'mcp.json');

		case 'codex-cli':
			// Codex CLI uses CLI commands, no config file
			return path.join(home, '.codex', 'mcp.json');

		default:
			throw new Error(`Unknown agent: ${agent}`);
	}
}

/**
 * Check if an agent appears to be installed
 */
export function isAgentInstalled(agent: AiAgent): boolean {
	const configPath = getAgentConfigPath(agent);
	const configDir = path.dirname(configPath);
	return fs.existsSync(configDir);
}

// ============================================================================
// CLI Command Helpers
// ============================================================================

/**
 * Check if a command is available in PATH
 */
export async function isCommandAvailable(command: string): Promise<boolean> {
	try {
		const checkCommand = isWindows
			? `where ${command}`
			: `command -v ${command}`;
		await execAsync(checkCommand);
		return true;
	} catch {
		return false;
	}
}

/**
 * Execute a shell command and return result
 */
export async function executeCommand(command: string): Promise<{ success: boolean; stdout?: string; stderr?: string; error?: string }> {
	try {
		const { stdout, stderr } = await execAsync(command);
		return { success: true, stdout, stderr };
	} catch (error: unknown) {
		const err = error as { message?: string; stdout?: string; stderr?: string };
		return {
			success: false,
			error: err.message || 'Command failed',
			stdout: err.stdout,
			stderr: err.stderr
		};
	}
}

// ============================================================================
// Claude Code Extension Binary
// ============================================================================

/**
 * Get the Claude Code binary path from the VS Code extension
 * Finds the Claude CLI binary inside the VS Code extension
 */
export function getClaudeCodeBinaryPath(extensionPath: string | undefined): string | undefined {
	if (!extensionPath) {
		return undefined;
	}

	const platform = isWindows ? 'claude.exe' : 'claude';

	// Try new path format first (newer Claude Code versions)
	const binariesPath = path.join(
		extensionPath,
		'resources',
		'native-binaries',
		`${process.platform}-${process.arch}`,
		platform
	);

	if (fs.existsSync(binariesPath)) {
		return binariesPath;
	}

	// Try old path format (older Claude Code versions)
	const binaryPath = path.join(
		extensionPath,
		'resources',
		'native-binary',
		platform
	);

	if (fs.existsSync(binaryPath)) {
		return binaryPath;
	}

	return undefined;
}

/**
 * Get Codex binary path from the VS Code extension
 * Finds the Codex CLI binary inside the VS Code extension
 */
export function getCodexBinaryPath(extensionPath: string | undefined): string | undefined {
	if (!extensionPath) {
		return undefined;
	}

	let platform = '';
	let arch = '';

	switch (process.platform) {
		case 'win32':
			platform = 'windows';
			break;
		case 'darwin':
			platform = 'macos';
			break;
		default:
			platform = 'linux';
			break;
	}

	switch (process.arch) {
		case 'x64':
			arch = 'x86_64';
			break;
		case 'arm64':
			arch = 'aarch64';
			break;
	}

	const binaryName = `codex${isWindows ? '.exe' : ''}`;
	return path.join(extensionPath, 'bin', `${platform}-${arch}`, binaryName);
}

// ============================================================================
// Claude CLI Commands
// ============================================================================

/**
 * Build Claude MCP add command (extension version)
 */
export function buildClaudeExtensionAddCommand(claudeBinaryPath: string, mcpBinaryPath: string, wsPort: number): string {
	return `"${claudeBinaryPath}" mcp add --transport stdio roopik "${mcpBinaryPath}" -s user -- --ws-port ${wsPort}`;
}

/**
 * Build Claude MCP remove command (extension version)
 */
export function buildClaudeExtensionRemoveCommand(claudeBinaryPath: string): string {
	return `"${claudeBinaryPath}" mcp remove roopik -s user`;
}

/**
 * Build global Claude CLI add command
 */
export function buildGlobalClaudeAddCommand(mcpBinaryPath: string, wsPort: number): string {
	return `claude mcp add --transport stdio --scope user roopik "${mcpBinaryPath}" -- --ws-port ${wsPort}`;
}

/**
 * Build global Claude CLI remove command
 */
export function buildGlobalClaudeRemoveCommand(): string {
	return 'claude mcp remove roopik --scope user';
}

/**
 * Build Codex extension add command
 */
export function buildCodexExtensionAddCommand(codexBinaryPath: string, mcpBinaryPath: string, wsPort: number): string {
	return `"${codexBinaryPath}" mcp add roopik -- "${mcpBinaryPath}" --ws-port ${wsPort}`;
}

/**
 * Build Codex extension remove command
 */
export function buildCodexExtensionRemoveCommand(codexBinaryPath: string): string {
	return `"${codexBinaryPath}" mcp remove roopik`;
}

/**
 * Build global Codex CLI add command
 */
export function buildGlobalCodexAddCommand(mcpBinaryPath: string, wsPort: number): string {
	return `codex mcp add roopik -- "${mcpBinaryPath}" --ws-port ${wsPort}`;
}

/**
 * Build global Codex CLI remove command
 */
export function buildGlobalCodexRemoveCommand(): string {
	return 'codex mcp remove roopik';
}

// ============================================================================
// Claude Allow Rules
// ============================================================================

const ROOPIK_MCP_ALLOW_RULE = 'mcp__roopik';

/**
 * Add Roopik to Claude Code's permission allow list
 * This enables auto-approval of Roopik MCP tools without user confirmation
 * CRITICAL: Without this, Claude Code will prompt for every tool use!
 */
export function addClaudeAllowRule(): boolean {
	const settingsPath = getClaudeSettingsPath();

	try {
		let config: { permissions?: { allow?: string[]; deny?: string[] } } = {};

		if (fs.existsSync(settingsPath)) {
			const content = fs.readFileSync(settingsPath, 'utf-8');
			config = JSON.parse(content);
		} else {
			// Create directory if needed
			fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
		}

		// Initialize permissions structure
		if (!config.permissions) {
			config.permissions = {};
		}
		if (!config.permissions.allow) {
			config.permissions.allow = [];
		}

		// Add allow rule if not present
		if (!config.permissions.allow.includes(ROOPIK_MCP_ALLOW_RULE)) {
			config.permissions.allow.push(ROOPIK_MCP_ALLOW_RULE);
			fs.writeFileSync(settingsPath, JSON.stringify(config, null, 2), 'utf-8');
			console.log('[MCP Installer] Added Roopik to Claude Code allow list');
		}

		return true;
	} catch (error) {
		console.error('[MCP Installer] Failed to add Claude allow rule:', error);
		return false;
	}
}

/**
 * Remove Roopik from Claude Code's permission allow list
 */
export function removeClaudeAllowRule(): boolean {
	const settingsPath = getClaudeSettingsPath();

	try {
		if (!fs.existsSync(settingsPath)) {
			return false;
		}

		const content = fs.readFileSync(settingsPath, 'utf-8');
		const config: { permissions?: { allow?: string[]; deny?: string[] } } = JSON.parse(content);

		if (config.permissions?.allow) {
			const index = config.permissions.allow.indexOf(ROOPIK_MCP_ALLOW_RULE);
			if (index > -1) {
				config.permissions.allow.splice(index, 1);
				fs.writeFileSync(settingsPath, JSON.stringify(config, null, 2), 'utf-8');
				console.log('[MCP Installer] Removed Roopik from Claude Code allow list');
				return true;
			}
		}

		return false;
	} catch (error) {
		console.error('[MCP Installer] Failed to remove Claude allow rule:', error);
		return false;
	}
}

// ============================================================================
// Config File Operations
// ============================================================================

/**
 * Read a JSON config file, returning null if not found
 */
export function readJsonConfig<T>(filePath: string): T | null {
	try {
		if (!fs.existsSync(filePath)) {
			return null;
		}
		const content = fs.readFileSync(filePath, 'utf-8');
		return JSON.parse(content) as T;
	} catch (error) {
		console.error(`Failed to read config from ${filePath}:`, error);
		return null;
	}
}

/**
 * Write a JSON config file, creating directories if needed
 */
export function writeJsonConfig<T>(filePath: string, config: T): void {
	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Create a backup of a config file
 */
export function backupConfig(filePath: string): string | null {
	if (!fs.existsSync(filePath)) {
		return null;
	}

	const backupPath = `${filePath}.backup.${Date.now()}`;
	fs.copyFileSync(filePath, backupPath);
	return backupPath;
}

// ============================================================================
// MCP Server Entry Generation
// ============================================================================

/**
 * Generate the MCP server entry for registration
 */
export function generateMcpServerEntry(options: {
	binaryPath: string;
	wsPort: number;
}): McpServerEntry {
	return {
		name: 'roopik',
		transport: 'stdio',
		command: options.binaryPath,
		args: ['--ws-port', options.wsPort.toString()],
		env: {}
	};
}

/**
 * Check if Roopik is already registered in a config
 */
export function isRoopikRegistered(config: { mcpServers?: Record<string, unknown> } | null): boolean {
	if (!config || !config.mcpServers) {
		return false;
	}
	return 'roopik' in config.mcpServers;
}

/**
 * Add Roopik MCP server to a config object
 */
export function addRoopikToConfig<T extends { mcpServers?: Record<string, unknown> }>(
	config: T | null,
	entry: McpServerEntry
): T {
	const result = config || {} as T;
	if (!result.mcpServers) {
		result.mcpServers = {};
	}

	result.mcpServers['roopik'] = {
		command: entry.command,
		args: entry.args,
		env: entry.env
	};

	return result;
}

/**
 * Remove Roopik MCP server from a config object
 */
export function removeRoopikFromConfig<T extends { mcpServers?: Record<string, unknown> }>(
	config: T | null
): T | null {
	if (!config || !config.mcpServers) {
		return config;
	}

	delete config.mcpServers['roopik'];
	return config;
}
