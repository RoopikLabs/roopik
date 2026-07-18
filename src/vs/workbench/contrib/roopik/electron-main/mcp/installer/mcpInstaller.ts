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
 * Handles auto-registration with external AI agents.
 *
 * Responsibilities:
 * - Detect installed AI agents
 * - Register/unregister Roopik MCP with each agent
 * - Use CLI commands where available (Claude, Codex)
 * - Manage Claude allow rules for auto-approval
 * - Handle config file updates for other agents
 */

import * as fs from 'fs';
import * as path from '../../../../../../base/common/path.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import type {
	AiAgent,
	AgentInfo,
	InstallationResult,
	RegistrationStatus,
	InstallerOptions,
	McpIntegrationSettings
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
	removeRoopikFromConfig,
	// CLI helpers
	isCommandAvailable,
	executeCommand,
	clearMacQuarantine,
	getClaudeCodeBinaryPath,
	getCodexBinaryPath,
	buildClaudeExtensionAddCommand,
	buildClaudeExtensionRemoveCommand,
	buildGlobalClaudeAddCommand,
	buildGlobalClaudeRemoveCommand,
	buildCodexExtensionAddCommand,
	buildCodexExtensionRemoveCommand,
	buildGlobalCodexAddCommand,
	buildGlobalCodexRemoveCommand,
	// Claude allow rules (CRITICAL)
	addClaudeAllowRule,
	removeClaudeAllowRule
} from './mcpInstallerUtils.js';

// ============================================================================
// Platform Adapter Interface
// ============================================================================

/**
 * Platform adapter for VS Code extension access
 * Allows the installer to find external extension paths
 */
export interface McpPlatformAdapter {
	/** Get the path to an external VS Code extension */
	getExternalExtensionPath(extensionId: string): string | undefined;
	/** Logger */
	log: {
		info(message: string): void;
		warn(message: string, error?: unknown): void;
		error(message: string, error?: unknown): void;
	};
}

// Extension IDs
const CLAUDE_CODE_EXTENSION_ID = 'anthropic.claude-code';
const CODEX_EXTENSION_ID = 'openai.chatgpt';

// ============================================================================
// MCP Installer Class
// ============================================================================

export class McpInstaller extends Disposable {
	private _wsPort: number = 9876;
	private _binaryPath: string;
	private _authToken: string = '';
	private _platformAdapter: McpPlatformAdapter | null = null;

	// Events
	private readonly _onRegistrationChanged = this._register(new Emitter<RegistrationStatus>());
	readonly onRegistrationChanged: Event<RegistrationStatus> = this._onRegistrationChanged.event;

	private readonly _onError = this._register(new Emitter<{ agent: AiAgent; error: string }>());
	readonly onError: Event<{ agent: AiAgent; error: string }> = this._onError.event;

	constructor() {
		super();
		this._binaryPath = getMcpBinaryPath();
		clearMacQuarantine(this._binaryPath);
	}

	/**
	 * Set the platform adapter for accessing VS Code extensions
	 */
	setPlatformAdapter(adapter: McpPlatformAdapter): void {
		this._platformAdapter = adapter;
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

	/**
	 * Set the authentication token for external agent configs
	 * External IDEs (Cursor, Windsurf) need this passed via --token arg
	 */
	setAuthToken(token: string): void {
		this._authToken = token;
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
			await this.getAgentInfo('codex'),
			await this.getAgentInfo('codex-cli'),
			await this.getAgentInfo('gemini'),
			await this.getAgentInfo('windsurf'),
			await this.getAgentInfo('cursor'),
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
		let installed = isAgentInstalled(agent);
		let registered = false;
		let registrationMethod: 'config-file' | 'cli-command' | 'api' = 'config-file';

		// For CLI-based agents, check command availability
		if (agent === 'claude-cli') {
			installed = await isCommandAvailable('claude');
			registrationMethod = 'cli-command';
		} else if (agent === 'claude-code') {
			const extPath = this._platformAdapter?.getExternalExtensionPath(CLAUDE_CODE_EXTENSION_ID);
			installed = !!getClaudeCodeBinaryPath(extPath) || installed;
			registrationMethod = 'cli-command';
		} else if (agent === 'codex') {
			// Codex extension - check extension binary
			const extPath = this._platformAdapter?.getExternalExtensionPath(CODEX_EXTENSION_ID);
			installed = !!getCodexBinaryPath(extPath) || installed;
			registrationMethod = 'cli-command';
		} else if (agent === 'codex-cli') {
			// Codex CLI - check global command
			installed = await isCommandAvailable('codex');
			registrationMethod = 'cli-command';
		}

		// For CLI-based agents, we can't reliably check registration from config files
		// because they manage their own storage locations
		if (installed && registrationMethod !== 'cli-command') {
			const config = readJsonConfig<{ mcpServers?: Record<string, unknown> }>(configPath);
			registered = isRoopikRegistered(config);
		}

		return {
			id: agent,
			name: this.getAgentDisplayName(agent),
			configPath,
			installed,
			registered,
			registrationMethod
		};
	}

	private getAgentDisplayName(agent: AiAgent): string {
		switch (agent) {
			case 'claude-code': return 'Claude Code (VS Code Extension)';
			case 'claude-cli': return 'Claude CLI';
			case 'codex': return 'Codex (VS Code Extension)';
			case 'codex-cli': return 'Codex CLI';
			case 'gemini': return 'Google Gemini';
			case 'windsurf': return 'Windsurf IDE';
			case 'cursor': return 'Cursor IDE';
			default: return agent;
		}
	}

	// ==========================================================================
	// Registration - Claude Code Extension (CLI-based)
	// ==========================================================================

	private async registerClaudeCodeExtension(): Promise<InstallationResult> {
		const extPath = this._platformAdapter?.getExternalExtensionPath(CLAUDE_CODE_EXTENSION_ID);
		const claudeBinaryPath = getClaudeCodeBinaryPath(extPath);

		if (!claudeBinaryPath) {
			return {
				success: false,
				agent: 'claude-code',
				message: 'Claude Code extension not found',
				error: 'Could not find Claude Code binary in extension'
			};
		}

		// Remove first (ignore errors)
		const removeCmd = buildClaudeExtensionRemoveCommand(claudeBinaryPath);
		await executeCommand(removeCmd);

		// Add
		const addCmd = buildClaudeExtensionAddCommand(claudeBinaryPath, this._binaryPath, this._wsPort, this._authToken);
		const result = await executeCommand(addCmd);

		if (result.success) {
			this._platformAdapter?.log.info('Registered Roopik with Claude Code extension');
			return {
				success: true,
				agent: 'claude-code',
				message: 'Successfully registered with Claude Code extension'
			};
		}

		return {
			success: false,
			agent: 'claude-code',
			message: 'Failed to register with Claude Code extension',
			error: result.error
		};
	}

	private async unregisterClaudeCodeExtension(): Promise<InstallationResult> {
		const extPath = this._platformAdapter?.getExternalExtensionPath(CLAUDE_CODE_EXTENSION_ID);
		const claudeBinaryPath = getClaudeCodeBinaryPath(extPath);

		if (!claudeBinaryPath) {
			return { success: true, agent: 'claude-code', message: 'Already unregistered' };
		}

		const removeCmd = buildClaudeExtensionRemoveCommand(claudeBinaryPath);
		const result = await executeCommand(removeCmd);

		return {
			success: result.success,
			agent: 'claude-code',
			message: result.success ? 'Unregistered from Claude Code extension' : 'Failed to unregister',
			error: result.error
		};
	}

	// ==========================================================================
	// Registration - Claude CLI (CLI-based)
	// ==========================================================================

	private async registerClaudeCli(): Promise<InstallationResult> {
		const isAvailable = await isCommandAvailable('claude');
		if (!isAvailable) {
			return {
				success: false,
				agent: 'claude-cli',
				message: 'Claude CLI not found',
				error: 'claude command not available in PATH'
			};
		}

		// Remove first
		await executeCommand(buildGlobalClaudeRemoveCommand());

		// Add
		const addCmd = buildGlobalClaudeAddCommand(this._binaryPath, this._wsPort, this._authToken);
		const result = await executeCommand(addCmd);

		if (result.success) {
			this._platformAdapter?.log.info('Registered Roopik with global Claude CLI');
			return {
				success: true,
				agent: 'claude-cli',
				message: 'Successfully registered with Claude CLI'
			};
		}

		return {
			success: false,
			agent: 'claude-cli',
			message: 'Failed to register with Claude CLI',
			error: result.error
		};
	}

	private async unregisterClaudeCli(): Promise<InstallationResult> {
		const removeCmd = buildGlobalClaudeRemoveCommand();
		const result = await executeCommand(removeCmd);

		return {
			success: result.success,
			agent: 'claude-cli',
			message: result.success ? 'Unregistered from Claude CLI' : 'Failed to unregister',
			error: result.error
		};
	}

	// ==========================================================================
	// Registration - Codex Extension (CLI-based)
	// ==========================================================================

	/**
	 * Register with Codex VS Code extension (uses extension binary)
	 * Uses extension binary to register via CLI
	 */
	private async registerCodexExtension(): Promise<InstallationResult> {
		const extPath = this._platformAdapter?.getExternalExtensionPath(CODEX_EXTENSION_ID);
		const codexBinaryPath = getCodexBinaryPath(extPath);

		if (!codexBinaryPath || !fs.existsSync(codexBinaryPath)) {
			return {
				success: false,
				agent: 'codex',
				message: 'Codex extension not found',
				error: 'Could not find Codex binary in extension'
			};
		}

		// Remove first (ignore errors)
		await executeCommand(buildCodexExtensionRemoveCommand(codexBinaryPath));

		// Add
		const addCmd = buildCodexExtensionAddCommand(codexBinaryPath, this._binaryPath, this._wsPort, this._authToken);
		const result = await executeCommand(addCmd);

		if (result.success) {
			this._platformAdapter?.log.info('Registered Roopik with Codex extension');
			return {
				success: true,
				agent: 'codex',
				message: 'Successfully registered with Codex extension'
			};
		}

		return {
			success: false,
			agent: 'codex',
			message: 'Failed to register with Codex extension',
			error: result.error
		};
	}

	private async unregisterCodexExtension(): Promise<InstallationResult> {
		const extPath = this._platformAdapter?.getExternalExtensionPath(CODEX_EXTENSION_ID);
		const codexBinaryPath = getCodexBinaryPath(extPath);

		if (!codexBinaryPath) {
			return { success: true, agent: 'codex', message: 'Already unregistered' };
		}

		const result = await executeCommand(buildCodexExtensionRemoveCommand(codexBinaryPath));

		return {
			success: result.success,
			agent: 'codex',
			message: result.success ? 'Unregistered from Codex extension' : 'Failed to unregister',
			error: result.error
		};
	}

	// ==========================================================================
	// Registration - Codex CLI (Global)
	// ==========================================================================

	/**
	 * Register with global Codex CLI (uses `codex` command in PATH)
	 * Uses global `codex` command in PATH
	 */
	private async registerCodexCli(): Promise<InstallationResult> {
		const isAvailable = await isCommandAvailable('codex');
		if (!isAvailable) {
			return {
				success: false,
				agent: 'codex-cli',
				message: 'Codex CLI not found',
				error: 'codex command not available in PATH'
			};
		}

		// Remove first
		await executeCommand(buildGlobalCodexRemoveCommand());

		// Add
		const addCmd = buildGlobalCodexAddCommand(this._binaryPath, this._wsPort, this._authToken);
		const result = await executeCommand(addCmd);

		if (result.success) {
			this._platformAdapter?.log.info('Registered Roopik with global Codex CLI');
			return {
				success: true,
				agent: 'codex-cli',
				message: 'Successfully registered with Codex CLI'
			};
		}

		return {
			success: false,
			agent: 'codex-cli',
			message: 'Failed to register with Codex CLI',
			error: result.error
		};
	}

	private async unregisterCodexCli(): Promise<InstallationResult> {
		const result = await executeCommand(buildGlobalCodexRemoveCommand());

		return {
			success: result.success,
			agent: 'codex-cli',
			message: result.success ? 'Unregistered from Codex CLI' : 'Failed to unregister',
			error: result.error
		};
	}

	// ==========================================================================
	// Registration - Config File Based (Gemini, Windsurf, Cursor)
	// ==========================================================================

	private async registerViaConfigFile(agent: AiAgent): Promise<InstallationResult> {
		const configPath = getAgentConfigPath(agent);

		try {
			if (!fs.existsSync(this._binaryPath)) {
				return {
					success: false,
					agent,
					message: 'MCP binary not found',
					error: `Binary not found at ${this._binaryPath}`
				};
			}

			// Create directory if needed
			const dir = path.dirname(configPath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}

			// Read existing config
			const existingConfig = readJsonConfig<{ mcpServers?: Record<string, unknown> }>(configPath);

			// Generate server entry with token for external IDEs
			const serverEntry = generateMcpServerEntry({
				binaryPath: this._binaryPath,
				wsPort: this._wsPort,
				token: this._authToken
			});

			// Add Roopik to config
			const newConfig = addRoopikToConfig(existingConfig, serverEntry);

			// Write config
			writeJsonConfig(configPath, newConfig);

			this._platformAdapter?.log.info(`Registered Roopik with ${agent}`);

			return {
				success: true,
				agent,
				message: `Successfully registered with ${this.getAgentDisplayName(agent)}`,
				configPath
			};

		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Unknown error';
			return {
				success: false,
				agent,
				message: `Failed to register with ${this.getAgentDisplayName(agent)}`,
				error: errorMsg,
				configPath
			};
		}
	}

	private async unregisterViaConfigFile(agent: AiAgent): Promise<InstallationResult> {
		const configPath = getAgentConfigPath(agent);

		try {
			if (!fs.existsSync(configPath)) {
				return { success: true, agent, message: 'Already unregistered', configPath };
			}

			const existingConfig = readJsonConfig<{ mcpServers?: Record<string, unknown> }>(configPath);

			if (!isRoopikRegistered(existingConfig)) {
				return { success: true, agent, message: 'Already unregistered', configPath };
			}

			const newConfig = removeRoopikFromConfig(existingConfig);
			if (newConfig) {
				writeJsonConfig(configPath, newConfig);
			}

			this._platformAdapter?.log.info(`Unregistered Roopik from ${agent}`);

			return {
				success: true,
				agent,
				message: `Unregistered from ${this.getAgentDisplayName(agent)}`,
				configPath
			};

		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Unknown error';
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
	// Public Registration API
	// ==========================================================================

	/**
	 * Register Roopik MCP with a specific agent
	 */
	async register(agent: AiAgent, createBackup: boolean = true): Promise<InstallationResult> {
		// Check binary exists
		if (!fs.existsSync(this._binaryPath)) {
			return {
				success: false,
				agent,
				message: 'MCP binary not found',
				error: `Binary not found at ${this._binaryPath}`
			};
		}

		// Backup config file if requested
		if (createBackup) {
			backupConfig(getAgentConfigPath(agent));
		}

		let result: InstallationResult;

		// Route to appropriate registration method
		switch (agent) {
			case 'claude-code':
				result = await this.registerClaudeCodeExtension();
				break;
			case 'claude-cli':
				result = await this.registerClaudeCli();
				break;
			case 'codex':
				result = await this.registerCodexExtension();
				break;
			case 'codex-cli':
				result = await this.registerCodexCli();
				break;
			default:
				// Config file based registration (gemini, windsurf, cursor)
				result = await this.registerViaConfigFile(agent);
		}

		// Add Claude allow rules if registering with Claude (CRITICAL!)
		if (result.success && (agent === 'claude-code' || agent === 'claude-cli')) {
			const allowRuleAdded = addClaudeAllowRule();
			if (allowRuleAdded) {
				this._platformAdapter?.log.info('Added Roopik to Claude allow rules');
			}
		}

		// Fire event
		this._onRegistrationChanged.fire(await this.getAgentStatus());

		return result;
	}

	/**
	 * Unregister Roopik MCP from a specific agent
	 */
	async unregister(agent: AiAgent, createBackup: boolean = true): Promise<InstallationResult> {
		if (createBackup) {
			backupConfig(getAgentConfigPath(agent));
		}

		let result: InstallationResult;

		switch (agent) {
			case 'claude-code':
				result = await this.unregisterClaudeCodeExtension();
				break;
			case 'claude-cli':
				result = await this.unregisterClaudeCli();
				break;
			case 'codex':
				result = await this.unregisterCodexExtension();
				break;
			case 'codex-cli':
				result = await this.unregisterCodexCli();
				break;
			default:
				// Config file based (gemini, windsurf, cursor)
				result = await this.unregisterViaConfigFile(agent);
		}

		// Fire event
		this._onRegistrationChanged.fire(await this.getAgentStatus());

		return result;
	}

	// ==========================================================================
	// Bulk Operations
	// ==========================================================================

	/**
	 * Setup integrations based on user settings
	 */
	async setupSelectiveIntegrations(settings: McpIntegrationSettings): Promise<InstallationResult[]> {
		const results: InstallationResult[] = [];
		let claudeInstalled = false;

		if (settings.claudeCode) {
			const result = await this.register('claude-code');
			results.push(result);
			if (result.success) { claudeInstalled = true; }
		}

		if (settings.claudeCli) {
			const result = await this.register('claude-cli');
			results.push(result);
			if (result.success) { claudeInstalled = true; }
		}

		// Add allow rules if any Claude integration succeeded
		if (claudeInstalled) {
			addClaudeAllowRule();
		}

		if (settings.codex) {
			results.push(await this.register('codex'));
		}

		if (settings.codexCli) {
			results.push(await this.register('codex-cli'));
		}

		if (settings.gemini) {
			results.push(await this.register('gemini'));
		}

		if (settings.windsurf) {
			results.push(await this.register('windsurf'));
		}

		if (settings.cursor) {
			results.push(await this.register('cursor'));
		}

		return results;
	}

	/**
	 * Remove all integrations (cleanup)
	 * Called on extension deactivation
	 */
	async removeAllIntegrations(): Promise<InstallationResult[]> {
		const results: InstallationResult[] = [];

		results.push(await this.unregister('claude-code'));
		results.push(await this.unregister('claude-cli'));
		results.push(await this.unregister('codex'));
		results.push(await this.unregister('codex-cli'));
		results.push(await this.unregisterViaConfigFile('gemini'));
		results.push(await this.unregisterViaConfigFile('windsurf'));
		results.push(await this.unregisterViaConfigFile('cursor'));

		// Remove allow rules
		removeClaudeAllowRule();

		return results;
	}

	/**
	 * Sync registrations: register enabled, unregister disabled
	 */
	async syncRegistrations(settings: McpIntegrationSettings): Promise<InstallationResult[]> {
		const results: InstallationResult[] = [];

		// Handle each agent
		for (const [key, enabled] of Object.entries(settings)) {
			const agent = this.settingsKeyToAgent(key);
			if (!agent) { continue; }

			const info = await this.getAgentInfo(agent);

			if (enabled && info.installed && !info.registered) {
				results.push(await this.register(agent));
			} else if (!enabled && info.registered) {
				results.push(await this.unregister(agent));
			}
		}

		// Remove Claude allow rules if both are disabled
		if (!settings.claudeCode && !settings.claudeCli) {
			removeClaudeAllowRule();
		}

		return results;
	}

	private settingsKeyToAgent(key: string): AiAgent | null {
		const map: Record<string, AiAgent> = {
			claudeCode: 'claude-code',
			claudeCli: 'claude-cli',
			codex: 'codex',
			codexCli: 'codex-cli',
			gemini: 'gemini',
			windsurf: 'windsurf',
			cursor: 'cursor'
		};
		return map[key] || null;
	}

	// ==========================================================================
	// Utility
	// ==========================================================================

	getOptions(): InstallerOptions {
		return {
			wsPort: this._wsPort,
			binaryPath: this._binaryPath,
			createBackup: true
		};
	}

	isBinaryAvailable(): boolean {
		return fs.existsSync(this._binaryPath);
	}

	getBinaryPath(): string {
		return this._binaryPath;
	}
}
