/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCP Installer
 *
 * Main installer class that handles auto-registration of Roopik MCP
 * with external AI agents (Claude Code, Codex, Gemini, Windsurf, etc.)
 *
 * Responsibilities:
 * - Detect installed AI agents
 * - Register/unregister Roopik MCP with each agent
 * - Handle config file updates
 * - React to VS Code settings changes
 */

import * as fs from 'fs';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import type {
	AiAgent,
	AgentInfo,
	InstallationResult,
	RegistrationStatus,
	InstallerOptions,
	McpIntegrationSettings,
	ClaudeCodeConfig,
	ClaudeCliConfig,
	CursorConfig
} from './mcpInstallerTypes.js';
import {
	getAgentConfigPath,
	isAgentInstalled,
	getMcpBinaryPath,
	readJsonConfig,
	writeJsonConfig,
	backupConfig,
	generateMcpServerEntry,
	isRoopikRegistered,
	addRoopikToConfig,
	removeRoopikFromConfig
} from './mcpInstallerUtils.js';

// ============================================================================
// MCP Installer Class
// ============================================================================

export class McpInstaller extends Disposable {
	private _wsPort: number = 9876;
	private _binaryPath: string;

	// Events
	private readonly _onRegistrationChanged = this._register(new Emitter<RegistrationStatus>());
	readonly onRegistrationChanged: Event<RegistrationStatus> = this._onRegistrationChanged.event;

	private readonly _onError = this._register(new Emitter<{ agent: AiAgent; error: string }>());
	readonly onError: Event<{ agent: AiAgent; error: string }> = this._onError.event;

	constructor() {
		super();
		this._binaryPath = getMcpBinaryPath();
	}

	/**
	 * Update the WebSocket port used for registration
	 */
	setWsPort(port: number): void {
		this._wsPort = port;
	}

	/**
	 * Update the binary path (useful for development/testing)
	 */
	setBinaryPath(path: string): void {
		this._binaryPath = path;
	}

	// ==========================================================================
	// Agent Detection
	// ==========================================================================

	/**
	 * Get list of all supported agents with their installation/registration status
	 */
	async getAgentStatus(): Promise<RegistrationStatus> {
		const agents: AgentInfo[] = [
			await this.getAgentInfo('claude-code'),
			await this.getAgentInfo('claude-cli'),
			await this.getAgentInfo('cursor'),
			await this.getAgentInfo('windsurf'),
			await this.getAgentInfo('codex'),
			await this.getAgentInfo('gemini'),
		];

		return {
			agents,
			lastChecked: Date.now()
		};
	}

	/**
	 * Get info for a specific agent
	 */
	async getAgentInfo(agent: AiAgent): Promise<AgentInfo> {
		const configPath = getAgentConfigPath(agent);
		const installed = isAgentInstalled(agent);
		let registered = false;

		if (installed) {
			const config = readJsonConfig<{ mcpServers?: Record<string, unknown> }>(configPath);
			registered = isRoopikRegistered(config);
		}

		return {
			id: agent,
			name: this.getAgentDisplayName(agent),
			configPath,
			installed,
			registered,
			registrationMethod: 'config-file'
		};
	}

	private getAgentDisplayName(agent: AiAgent): string {
		switch (agent) {
			case 'claude-code': return 'Claude Code (VS Code Extension)';
			case 'claude-cli': return 'Claude CLI';
			case 'cursor': return 'Cursor IDE';
			case 'windsurf': return 'Windsurf IDE';
			case 'codex': return 'OpenAI Codex';
			case 'gemini': return 'Google Gemini';
			default: return agent;
		}
	}

	// ==========================================================================
	// Registration
	// ==========================================================================

	/**
	 * Register Roopik MCP with a specific agent
	 */
	async register(agent: AiAgent, createBackup: boolean = true): Promise<InstallationResult> {
		const configPath = getAgentConfigPath(agent);

		try {
			// Check if binary exists
			if (!fs.existsSync(this._binaryPath)) {
				return {
					success: false,
					agent,
					message: 'MCP binary not found',
					error: `Binary not found at ${this._binaryPath}. Please ensure Roopik is properly installed.`
				};
			}

			// Check if agent is installed
			if (!isAgentInstalled(agent)) {
				return {
					success: false,
					agent,
					message: `${this.getAgentDisplayName(agent)} is not installed`,
					error: 'Agent not detected on this system'
				};
			}

			// Create backup if requested
			if (createBackup) {
				backupConfig(configPath);
			}

			// Read existing config
			const existingConfig = readJsonConfig<ClaudeCodeConfig | ClaudeCliConfig | CursorConfig>(configPath);

			// Generate server entry
			const serverEntry = generateMcpServerEntry({
				binaryPath: this._binaryPath,
				wsPort: this._wsPort
			});

			// Add Roopik to config
			const newConfig = addRoopikToConfig(existingConfig, serverEntry);

			// Write config
			writeJsonConfig(configPath, newConfig);

			console.log(`[MCP Installer] Registered Roopik with ${agent} at ${configPath}`);

			// Fire event
			this._onRegistrationChanged.fire(await this.getAgentStatus());

			return {
				success: true,
				agent,
				message: `Successfully registered with ${this.getAgentDisplayName(agent)}`,
				configPath
			};

		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Unknown error';
			this._onError.fire({ agent, error: errorMsg });
			return {
				success: false,
				agent,
				message: `Failed to register with ${this.getAgentDisplayName(agent)}`,
				error: errorMsg,
				configPath
			};
		}
	}

	/**
	 * Unregister Roopik MCP from a specific agent
	 */
	async unregister(agent: AiAgent, createBackup: boolean = true): Promise<InstallationResult> {
		const configPath = getAgentConfigPath(agent);

		try {
			// Check if config exists
			if (!fs.existsSync(configPath)) {
				return {
					success: true,
					agent,
					message: 'Already unregistered (config file does not exist)',
					configPath
				};
			}

			// Create backup if requested
			if (createBackup) {
				backupConfig(configPath);
			}

			// Read existing config
			const existingConfig = readJsonConfig<ClaudeCodeConfig | ClaudeCliConfig | CursorConfig>(configPath);

			if (!isRoopikRegistered(existingConfig)) {
				return {
					success: true,
					agent,
					message: 'Already unregistered',
					configPath
				};
			}

			// Remove Roopik from config
			const newConfig = removeRoopikFromConfig(existingConfig);

			// Write config
			if (newConfig) {
				writeJsonConfig(configPath, newConfig);
			}

			console.log(`[MCP Installer] Unregistered Roopik from ${agent}`);

			// Fire event
			this._onRegistrationChanged.fire(await this.getAgentStatus());

			return {
				success: true,
				agent,
				message: `Successfully unregistered from ${this.getAgentDisplayName(agent)}`,
				configPath
			};

		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Unknown error';
			this._onError.fire({ agent, error: errorMsg });
			return {
				success: false,
				agent,
				message: `Failed to unregister from ${this.getAgentDisplayName(agent)}`,
				error: errorMsg,
				configPath
			};
		}
	}

	// ==========================================================================
	// Bulk Operations
	// ==========================================================================

	/**
	 * Register with all installed agents based on settings
	 */
	async registerAll(settings: McpIntegrationSettings): Promise<InstallationResult[]> {
		const results: InstallationResult[] = [];

		if (settings.claudeCode) {
			results.push(await this.register('claude-code'));
		}
		if (settings.claudeCli) {
			results.push(await this.register('claude-cli'));
		}
		if (settings.cursor) {
			results.push(await this.register('cursor'));
		}
		if (settings.windsurf) {
			results.push(await this.register('windsurf'));
		}
		if (settings.codex) {
			results.push(await this.register('codex'));
		}
		if (settings.gemini) {
			results.push(await this.register('gemini'));
		}

		return results;
	}

	/**
	 * Unregister from all agents
	 */
	async unregisterAll(): Promise<InstallationResult[]> {
		const agents: AiAgent[] = ['claude-code', 'claude-cli', 'cursor', 'windsurf', 'codex', 'gemini'];
		const results: InstallationResult[] = [];

		for (const agent of agents) {
			// Only unregister if currently registered
			const info = await this.getAgentInfo(agent);
			if (info.registered) {
				results.push(await this.unregister(agent));
			}
		}

		return results;
	}

	/**
	 * Sync registrations based on settings
	 * Registers with enabled agents, unregisters from disabled ones
	 */
	async syncRegistrations(settings: McpIntegrationSettings): Promise<InstallationResult[]> {
		const results: InstallationResult[] = [];

		// Claude Code
		if (settings.claudeCode) {
			const info = await this.getAgentInfo('claude-code');
			if (info.installed && !info.registered) {
				results.push(await this.register('claude-code'));
			}
		} else {
			const info = await this.getAgentInfo('claude-code');
			if (info.registered) {
				results.push(await this.unregister('claude-code'));
			}
		}

		// Claude CLI
		if (settings.claudeCli) {
			const info = await this.getAgentInfo('claude-cli');
			if (info.installed && !info.registered) {
				results.push(await this.register('claude-cli'));
			}
		} else {
			const info = await this.getAgentInfo('claude-cli');
			if (info.registered) {
				results.push(await this.unregister('claude-cli'));
			}
		}

		// Cursor
		if (settings.cursor) {
			const info = await this.getAgentInfo('cursor');
			if (info.installed && !info.registered) {
				results.push(await this.register('cursor'));
			}
		} else {
			const info = await this.getAgentInfo('cursor');
			if (info.registered) {
				results.push(await this.unregister('cursor'));
			}
		}

		// Windsurf
		if (settings.windsurf) {
			const info = await this.getAgentInfo('windsurf');
			if (info.installed && !info.registered) {
				results.push(await this.register('windsurf'));
			}
		} else {
			const info = await this.getAgentInfo('windsurf');
			if (info.registered) {
				results.push(await this.unregister('windsurf'));
			}
		}

		// Codex
		if (settings.codex) {
			const info = await this.getAgentInfo('codex');
			if (info.installed && !info.registered) {
				results.push(await this.register('codex'));
			}
		} else {
			const info = await this.getAgentInfo('codex');
			if (info.registered) {
				results.push(await this.unregister('codex'));
			}
		}

		// Gemini
		if (settings.gemini) {
			const info = await this.getAgentInfo('gemini');
			if (info.installed && !info.registered) {
				results.push(await this.register('gemini'));
			}
		} else {
			const info = await this.getAgentInfo('gemini');
			if (info.registered) {
				results.push(await this.unregister('gemini'));
			}
		}

		return results;
	}

	// ==========================================================================
	// Utility
	// ==========================================================================

	/**
	 * Get the current installer options
	 */
	getOptions(): InstallerOptions {
		return {
			wsPort: this._wsPort,
			binaryPath: this._binaryPath,
			createBackup: true
		};
	}

	/**
	 * Check if the MCP binary is available
	 */
	isBinaryAvailable(): boolean {
		return fs.existsSync(this._binaryPath);
	}

	/**
	 * Get the binary path
	 */
	getBinaryPath(): string {
		return this._binaryPath;
	}
}
