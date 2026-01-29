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
import { fileURLToPath } from 'url';
import type { AiAgent, McpServerEntry } from './mcpInstallerTypes.js';

const execAsync = promisify(exec);

// ES Module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Constants
// ============================================================================

/** MCP server name used for registration (change this to rebrand) */
export const ROOPIK_MCP_NAME = 'roopik';

/** Claude allow rule pattern */
const ROOPIK_MCP_ALLOW_RULE = `mcp__${ROOPIK_MCP_NAME}`;

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

	// Development fallback - find resources/mcp-binaries directory
	// Must check for mcp-binaries subfolder to avoid finding wrong resources folder
	let currentDir = __dirname;
	for (let i = 0; i < 15; i++) {
		const resourcesDir = path.join(currentDir, 'resources');
		const mcpBinariesDir = path.join(resourcesDir, 'mcp-binaries');
		if (fs.existsSync(mcpBinariesDir)) {
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
// IDE Extension Folder Scanning
// ============================================================================

/**
 * Get all IDE extension folders to scan
 * Includes Roopik, VS Code, Cursor, and other IDE extension directories
 *
 * WHY SCAN OTHER IDEs?
 * If user has Claude Code installed in VS Code but uses Roopik as main IDE,
 * we can still register Roopik's MCP with their Claude by finding the binary there.
 * This enables cross-IDE integration.
 */
function getExtensionFolders(): string[] {
	const home = getHomeDir();
	return [
		// Roopik (production) - FIRST priority
		path.join(home, '.roopik', 'extensions'),
		// Roopik (development)
		path.join(home, '.roopik-dev', 'extensions'),
		// VS Code - scan to find Claude/Codex if installed there
		path.join(home, '.vscode', 'extensions'),
		// Cursor - scan to find Claude/Codex if installed there
		path.join(home, '.cursor', 'extensions'),
		// VSCodium
		path.join(home, '.vscode-oss', 'extensions'),
		// Windsurf (Codeium's IDE)
		path.join(home, '.windsurf', 'extensions'),
	];
}

/**
 * Find an extension by ID prefix across all IDE extension folders
 * Returns the most recent version (highest version number)
 *
 * @param extensionIdPrefix - e.g., "anthropic.claude-code" or "openai.chatgpt"
 */
export function findExtensionPath(extensionIdPrefix: string): string | undefined {
	for (const folder of getExtensionFolders()) {
		if (!fs.existsSync(folder)) {
			continue;
		}

		try {
			const entries = fs.readdirSync(folder);
			// Find folders matching the extension ID prefix
			const matches = entries
				.filter(name => name.startsWith(extensionIdPrefix))
				.map(name => path.join(folder, name))
				.filter(p => fs.statSync(p).isDirectory());

			if (matches.length > 0) {
				// Sort to get highest version (last alphabetically)
				matches.sort();
				return matches[matches.length - 1];
			}
		} catch {
			// Folder not readable, skip
		}
	}

	return undefined;
}

// ============================================================================
// Claude Code Extension Binary
// ============================================================================

/**
 * Get the Claude Code CLI directory name for current platform
 */
function getClaudeCliDir(): string {
	switch (process.platform) {
		case 'win32':
			return 'cli-win32-x64';
		case 'darwin':
			return process.arch === 'arm64' ? 'cli-darwin-arm64' : 'cli-darwin-x64';
		default:
			return 'cli-linux-x64';
	}
}

/**
 * Get the Claude Code binary path from the VS Code extension
 * Finds the Claude CLI binary inside the VS Code extension
 *
 * Checks multiple path structures:
 * 1. Roopik/newer structure: {extensionPath}/resources/native-binary/claude(.exe)
 * 2. VS Code/older structure: {extensionPath}/cli-{platform}-{arch}/claude(.exe)
 *
 * @param extensionPath - Optional path from platform adapter. If not provided, scans filesystem.
 */
export function getClaudeCodeBinaryPath(extensionPath: string | undefined): string | undefined {
	// If no extension path provided, scan filesystem to find it
	const actualExtPath = extensionPath || findExtensionPath('anthropic.claude-code');

	if (!actualExtPath) {
		return undefined;
	}

	const binaryName = isWindows ? 'claude.exe' : 'claude';

	// Check Roopik/newer structure first: resources/native-binary/
	const nativeBinaryPath = path.join(actualExtPath, 'resources', 'native-binary', binaryName);
	if (fs.existsSync(nativeBinaryPath)) {
		return nativeBinaryPath;
	}

	// Fallback to VS Code/older structure: cli-{platform}-{arch}/
	const cliDir = getClaudeCliDir();
	const cliBinaryPath = path.join(actualExtPath, cliDir, binaryName);
	if (fs.existsSync(cliBinaryPath)) {
		return cliBinaryPath;
	}

	return undefined;
}

/**
 * Get Codex binary path from the VS Code extension
 * Finds the Codex CLI binary inside the VS Code extension
 *
 * Path structure: {extensionPath}/bin/{platform}-{arch}/codex(.exe)
 * Example: ~/.roopik-dev/extensions/openai.chatgpt-0.4.68/bin/windows-x86_64/codex.exe
 *
 * @param extensionPath - Optional path from platform adapter. If not provided, scans filesystem.
 */
export function getCodexBinaryPath(extensionPath: string | undefined): string | undefined {
	// If no extension path provided, scan filesystem to find it
	const actualExtPath = extensionPath || findExtensionPath('openai.chatgpt');

	if (!actualExtPath) {
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
	const binaryPath = path.join(actualExtPath, 'bin', `${platform}-${arch}`, binaryName);

	if (fs.existsSync(binaryPath)) {
		return binaryPath;
	}

	return undefined;
}

// ============================================================================
// Claude CLI Commands
// ============================================================================

/**
 * Build Claude MCP add command (extension version)
 * Uses the Claude binary bundled with the VS Code extension
 *
 * IMPORTANT: -s user flag registers at USER scope (global, all projects)
 * Without it, defaults to PROJECT scope (only current folder)
 */
export function buildClaudeExtensionAddCommand(claudeBinaryPath: string, mcpBinaryPath: string, wsPort: number): string {
	// Format: claude mcp add <name> -s user -- <command> [args...]
	return `"${claudeBinaryPath}" mcp add ${ROOPIK_MCP_NAME} -s user -- "${mcpBinaryPath}" --ws-port ${wsPort}`;
}

/**
 * Build Claude MCP remove command (extension version)
 */
export function buildClaudeExtensionRemoveCommand(claudeBinaryPath: string): string {
	return `"${claudeBinaryPath}" mcp remove ${ROOPIK_MCP_NAME} -s user`;
}

/**
 * Build global Claude CLI add command
 * Uses the global `claude` command installed in PATH
 *
 * Format: claude mcp add <name> -s user -- <command> [args...]
 */
export function buildGlobalClaudeAddCommand(mcpBinaryPath: string, wsPort: number): string {
	return `claude mcp add ${ROOPIK_MCP_NAME} -s user -- "${mcpBinaryPath}" --ws-port ${wsPort}`;
}

/**
 * Build global Claude CLI remove command
 */
export function buildGlobalClaudeRemoveCommand(): string {
	return `claude mcp remove ${ROOPIK_MCP_NAME} -s user`;
}

/**
 * Build Codex extension add command
 * Uses the Codex binary bundled with the VS Code extension
 */
export function buildCodexExtensionAddCommand(codexBinaryPath: string, mcpBinaryPath: string, wsPort: number): string {
	return `"${codexBinaryPath}" mcp add ${ROOPIK_MCP_NAME} -- "${mcpBinaryPath}" --ws-port ${wsPort}`;
}

/**
 * Build Codex extension remove command
 */
export function buildCodexExtensionRemoveCommand(codexBinaryPath: string): string {
	return `"${codexBinaryPath}" mcp remove ${ROOPIK_MCP_NAME}`;
}

/**
 * Build global Codex CLI add command
 * Uses the global `codex` command installed in PATH
 */
export function buildGlobalCodexAddCommand(mcpBinaryPath: string, wsPort: number): string {
	return `codex mcp add ${ROOPIK_MCP_NAME} -- "${mcpBinaryPath}" --ws-port ${wsPort}`;
}

/**
 * Build global Codex CLI remove command
 */
export function buildGlobalCodexRemoveCommand(): string {
	return `codex mcp remove ${ROOPIK_MCP_NAME}`;
}

// ============================================================================
// Claude Allow Rules
// ============================================================================

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
		name: ROOPIK_MCP_NAME,
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
	return ROOPIK_MCP_NAME in config.mcpServers;
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

	result.mcpServers[ROOPIK_MCP_NAME] = {
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

	delete config.mcpServers[ROOPIK_MCP_NAME];
	return config;
}
