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
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { AiAgent, McpServerEntry } from './mcpInstallerTypes.js';

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
	// First check if we're in development (binary might not exist yet)
	const resourcesPath = getResourcesPath();

	if (isWindows) {
		return path.join(resourcesPath, 'mcp-binaries', 'roopik-mcp-win-x64.exe');
	} else if (isMac) {
		// Check architecture
		const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
		return path.join(resourcesPath, 'mcp-binaries', `roopik-mcp-macos-${arch}`);
	} else {
		return path.join(resourcesPath, 'mcp-binaries', 'roopik-mcp-linux-x64');
	}
}

/**
 * Get the resources path (where binaries are stored)
 * In production: app.getPath('resources')
 * In development: project root/resources
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

	// Development fallback - go up from current file to find project root
	// This file is at: src/vs/workbench/contrib/roopik/electron-main/mcp/installer/
	// Resources are at: resources/
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
 * Get config file path for a specific agent
 */
export function getAgentConfigPath(agent: AiAgent): string {
	const home = getHomeDir();
	const appData = getAppDataDir();

	switch (agent) {
		case 'claude-code':
			// Claude Code VS Code extension
			if (isWindows) {
				return path.join(appData, 'Code', 'User', 'globalStorage', 'anthropic.claude-code', 'settings', 'claude_mcp_settings.json');
			} else if (isMac) {
				return path.join(home, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'anthropic.claude-code', 'settings', 'claude_mcp_settings.json');
			} else {
				return path.join(home, '.config', 'Code', 'User', 'globalStorage', 'anthropic.claude-code', 'settings', 'claude_mcp_settings.json');
			}

		case 'claude-cli':
			// Claude CLI standalone
			return path.join(home, '.claude', 'settings.json');

		case 'cursor':
			// Cursor IDE
			return path.join(home, '.cursor', 'mcp.json');

		case 'windsurf':
			// Windsurf IDE
			if (isWindows) {
				return path.join(appData, 'Windsurf', 'mcp.json');
			} else if (isMac) {
				return path.join(home, 'Library', 'Application Support', 'Windsurf', 'mcp.json');
			} else {
				return path.join(home, '.config', 'windsurf', 'mcp.json');
			}

		case 'codex':
			// OpenAI Codex (placeholder - actual path TBD)
			return path.join(home, '.codex', 'mcp.json');

		case 'gemini':
			// Google Gemini (placeholder - actual path TBD)
			return path.join(home, '.gemini', 'mcp.json');

		default:
			throw new Error(`Unknown agent: ${agent}`);
	}
}

/**
 * Check if an agent appears to be installed by checking for its config directory
 */
export function isAgentInstalled(agent: AiAgent): boolean {
	const configPath = getAgentConfigPath(agent);
	const configDir = path.dirname(configPath);

	// Check if the config directory exists
	// This is a heuristic - the agent might be installed even without config
	return fs.existsSync(configDir);
}

// ============================================================================
// Config File Operations
// ============================================================================

/**
 * Read a JSON config file, returning empty object if not found
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
		env: {
			// Optionally set env var as fallback
			ROOPIK_MCP_WS_URL: `ws://localhost:${options.wsPort}/mcp`
		}
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
