/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCP Installer Types
 *
 * Types and interfaces for auto-registration with external AI agents.
 */

// ============================================================================
// Supported AI Agents
// ============================================================================

/**
 * Supported external AI agents that can use MCP
 * Supported external AI agents for MCP registration
 */
export type AiAgent =
	| 'claude-code'      // Claude Code VS Code extension (CLI binary)
	| 'claude-cli'       // Claude CLI (global PATH command)
	| 'codex'            // OpenAI Codex VS Code extension (CLI binary)
	| 'codex-cli'        // Codex CLI (global PATH command)
	| 'gemini'           // Google Gemini (config file)
	| 'windsurf'         // Windsurf IDE (config file)
	| 'cursor';          // Cursor IDE (config file)

/**
 * Agent configuration info
 */
export interface AgentInfo {
	/** Agent identifier */
	id: AiAgent;
	/** Display name */
	name: string;
	/** Config file path (relative to home or absolute) */
	configPath: string;
	/** Whether this agent is currently installed/detected */
	installed: boolean;
	/** Whether Roopik is registered with this agent */
	registered: boolean;
	/** Registration method */
	registrationMethod: 'config-file' | 'cli-command' | 'api';
}

// ============================================================================
// Registration Configuration
// ============================================================================

/**
 * MCP server registration entry (what gets written to agent config)
 */
export interface McpServerEntry {
	/** Server name */
	name: string;
	/** Transport type */
	transport: 'stdio';
	/** Path to the binary */
	command: string;
	/** Command arguments */
	args?: string[];
	/** Environment variables */
	env?: Record<string, string>;
}

/**
 * Claude Code MCP config format
 * Located at: ~/.config/claude-code/mcp.json (Linux/Mac)
 *             %APPDATA%/claude-code/mcp.json (Windows)
 */
export interface ClaudeCodeConfig {
	mcpServers?: Record<string, {
		command: string;
		args?: string[];
		env?: Record<string, string>;
	}>;
}

/**
 * Claude CLI MCP config format
 * Located at: ~/.claude/settings.json
 */
export interface ClaudeCliConfig {
	mcpServers?: Record<string, {
		command: string;
		args?: string[];
		env?: Record<string, string>;
	}>;
}

/**
 * Cursor IDE MCP config format
 * Located at: ~/.cursor/mcp.json
 */
export interface CursorConfig {
	mcpServers?: Record<string, {
		command: string;
		args?: string[];
		env?: Record<string, string>;
	}>;
}

// ============================================================================
// Installation Result Types
// ============================================================================

/**
 * Result of an installation/uninstallation operation
 */
export interface InstallationResult {
	success: boolean;
	agent: AiAgent;
	message: string;
	error?: string;
	/** Path to config file that was modified */
	configPath?: string;
}

/**
 * Status of all agent registrations
 */
export interface RegistrationStatus {
	agents: AgentInfo[];
	/** Timestamp of last check */
	lastChecked: number;
}

// ============================================================================
// Installer Options
// ============================================================================

/**
 * Options for the installer
 */
export interface InstallerOptions {
	/** WebSocket port that Roopik's MCP server is running on */
	wsPort: number;
	/** Path to the MCP STDIO binary */
	binaryPath: string;
	/** Whether to create backup of existing configs */
	createBackup?: boolean;
}

/**
 * Settings for which agents to auto-register with
 * User settings for which agents to auto-register with
 */
export interface McpIntegrationSettings {
	claudeCode?: boolean;    // Claude Code VS Code extension
	claudeCli?: boolean;     // Claude CLI (global)
	codex?: boolean;         // Codex VS Code extension
	codexCli?: boolean;      // Codex CLI (global)
	gemini?: boolean;        // Gemini (config file)
	windsurf?: boolean;      // Windsurf (config file)
	cursor?: boolean;        // Cursor (config file)
}
