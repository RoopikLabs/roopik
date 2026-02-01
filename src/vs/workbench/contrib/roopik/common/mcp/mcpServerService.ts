/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCP Server Service Interface
 *
 * Common interface shared between main process (McpServerService) and renderer (client).
 *
 * Provides:
 * - Server lifecycle control (start/stop/restart)
 * - Agent registration management (enable/disable individual agents)
 * - Status monitoring for both server and agents
 */

import { Event } from '../../../../../base/common/event.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

export const IMcpServerService = createDecorator<IMcpServerService>('mcpServerService');

// ============================================================================
// Types
// ============================================================================

/**
 * MCP server status
 */
export interface McpServerStatus {
	/** Whether the STDIO/WebSocket MCP server is running */
	running: boolean;
	/** WebSocket port for STDIO binary connections */
	wsPort: number;
	/** Error message if server failed to start */
	error?: string;
}

/**
 * Agent identifiers matching McpInstaller types
 */
export type AgentId =
	| 'claude-code'
	| 'claude-cli'
	| 'codex'
	| 'codex-cli'
	| 'gemini'
	| 'windsurf'
	| 'cursor';

/**
 * Status of an individual AI agent integration
 */
export interface AgentStatus {
	/** Agent identifier */
	id: AgentId;
	/** Human-readable name */
	name: string;
	/** Whether the agent is installed/detected on the system */
	installed: boolean;
	/** Whether Roopik is currently registered with this agent */
	registered: boolean;
	/** How registration is managed */
	registrationMethod: 'cli-command' | 'config-file';
}

/**
 * Full MCP integration status
 */
export interface McpIntegrationStatus {
	/** Server status */
	server: McpServerStatus;
	/** Status of all agents */
	agents: AgentStatus[];
	/** Timestamp of last status check */
	lastChecked: number;
}

/**
 * Connection info for external IDEs
 */
export interface McpConnectionInfo {
	/** WebSocket port */
	wsPort: number;
	/** Authentication token (for external IDEs) */
	token: string;
	/** Path to MCP binary */
	binaryPath: string;
	/** Whether the server is running */
	isRunning: boolean;
}

// ============================================================================
// Service Interface
// ============================================================================

export interface IMcpServerService {
	readonly _serviceBrand: undefined;

	// ========================================
	// Events
	// ========================================

	/** Event fired when MCP server status changes */
	readonly onStatusChanged: Event<McpServerStatus>;

	/** Event fired when agent registration status changes */
	readonly onAgentStatusChanged: Event<AgentStatus[]>;

	// ========================================
	// Server Lifecycle
	// ========================================

	/** Restart the MCP server (stop + start) */
	restart(): Promise<void>;

	/** Get current server status */
	getStatus(): Promise<McpServerStatus>;

	/** Get the WebSocket port for STDIO connections */
	getWsPort(): Promise<number>;

	// ========================================
	// STDIO/WebSocket Control (Primary)
	// ========================================

	/** Check if STDIO/WebSocket MCP Server is enabled */
	isEnabled(): Promise<boolean>;

	/** Enable or disable MCP server */
	setEnabled(enabled: boolean): Promise<void>;


	// ========================================
	// Agent Control
	// ========================================

	/** Get status of all AI agent integrations */
	getAgentStatus(): Promise<AgentStatus[]>;

	/** Get full integration status (server + all agents) */
	getIntegrationStatus(): Promise<McpIntegrationStatus>;

	/** Enable a specific agent integration */
	enableAgent(agentId: AgentId): Promise<void>;

	/** Disable a specific agent integration */
	disableAgent(agentId: AgentId): Promise<void>;

	/** Sync all agent registrations with current settings */
	syncAgentRegistrations(): Promise<void>;

	/** Get connection info for external IDEs */
	getConnectionInfo(): Promise<McpConnectionInfo>;
}
