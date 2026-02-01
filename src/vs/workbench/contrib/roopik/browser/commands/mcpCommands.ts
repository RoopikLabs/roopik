/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * MCP Commands
 *
 * Commands for controlling MCP (Model Context Protocol) integrations.
 * - roopik.mcp.toggle: Toggle MCP server on/off
 * - roopik.mcp.showStatus: Show MCP integration status
 * - roopik.mcp.enableAgent: Enable a specific agent integration
 * - roopik.mcp.disableAgent: Disable a specific agent integration
 */

import { localize, localize2 } from '../../../../../nls.js';
import { registerAction2, Action2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IMcpServerService, AgentId, AgentStatus } from '../../common/mcp/index.js';

/**
 * Agent display info for quick pick
 */
interface AgentQuickPickItem extends IQuickPickItem {
	agentId: AgentId;
	status: AgentStatus;
}

/**
 * Register all MCP-related commands
 */
export function registerMcpCommands(): void {
	// Toggle MCP Server (master switch)
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.mcp.toggle',
				title: localize2('roopik.mcp.toggle', 'Toggle MCP Server'),
				category: localize2('roopik.category', 'Roopik'),
				f1: true
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const notificationService = accessor.get(INotificationService);
			const mcpServerService = accessor.get(IMcpServerService);

			try {
				const isEnabled = await mcpServerService.isEnabled();
				await mcpServerService.setEnabled(!isEnabled);

				if (!isEnabled) {
					notificationService.info('MCP Server enabled - AI agents can now connect');
				} else {
					notificationService.info('MCP Server disabled - All agent connections closed');
				}
			} catch (error) {
				notificationService.error(`Failed to toggle MCP Server: ${error}`);
			}
		}
	});

	// Show MCP Status
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.mcp.showStatus',
				title: localize2('roopik.mcp.showStatus', 'Show MCP Status'),
				category: localize2('roopik.category', 'Roopik'),
				f1: true
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const notificationService = accessor.get(INotificationService);
			const mcpServerService = accessor.get(IMcpServerService);

			try {
				const integrationStatus = await mcpServerService.getIntegrationStatus();
				const { server, agents } = integrationStatus;

				// Build status message
				const serverStatus = server.running ? 'Running' : 'Stopped';
				const registeredAgents = agents.filter(a => a.registered);
				const installedAgents = agents.filter(a => a.installed);

				let message = `MCP Server: ${serverStatus}`;
				if (server.running) {
					message += ` (WebSocket: ${server.wsPort})`;
				}
				message += `\n\nAgents: ${registeredAgents.length} registered, ${installedAgents.length} installed`;

				if (registeredAgents.length > 0) {
					message += '\n\nRegistered:';
					for (const agent of registeredAgents) {
						message += `\n  - ${agent.name}`;
					}
				}

				notificationService.notify({
					severity: Severity.Info,
					message,
					sticky: true
				});
			} catch (error) {
				notificationService.error(`Failed to get MCP status: ${error}`);
			}
		}
	});

	// Enable Agent Integration
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.mcp.enableAgent',
				title: localize2('roopik.mcp.enableAgent', 'Enable Agent Integration'),
				category: localize2('roopik.category', 'Roopik'),
				f1: true
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const quickInputService = accessor.get(IQuickInputService);
			const notificationService = accessor.get(INotificationService);
			const mcpServerService = accessor.get(IMcpServerService);

			try {
				const agents = await mcpServerService.getAgentStatus();

				// Filter to agents that are installed but not registered
				const availableAgents = agents.filter(a => a.installed && !a.registered);

				if (availableAgents.length === 0) {
					notificationService.info('All installed agents are already enabled, or no agents are detected.');
					return;
				}

				// Build quick pick items
				const items: AgentQuickPickItem[] = availableAgents.map(agent => ({
					label: agent.name,
					description: agent.installed ? 'Installed' : 'Not detected',
					agentId: agent.id,
					status: agent
				}));

				const selected = await quickInputService.pick(items, {
					placeHolder: localize('selectAgentToEnable', 'Select an agent to enable')
				});

				if (selected) {
					await mcpServerService.enableAgent(selected.agentId);
					notificationService.info(`Enabled ${selected.label}`);
				}
			} catch (error) {
				notificationService.error(`Failed to enable agent: ${error}`);
			}
		}
	});

	// Disable Agent Integration
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.mcp.disableAgent',
				title: localize2('roopik.mcp.disableAgent', 'Disable Agent Integration'),
				category: localize2('roopik.category', 'Roopik'),
				f1: true
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const quickInputService = accessor.get(IQuickInputService);
			const notificationService = accessor.get(INotificationService);
			const mcpServerService = accessor.get(IMcpServerService);

			try {
				const agents = await mcpServerService.getAgentStatus();

				// Filter to agents that are registered
				const registeredAgents = agents.filter(a => a.registered);

				if (registeredAgents.length === 0) {
					notificationService.info('No agents are currently enabled.');
					return;
				}

				// Build quick pick items
				const items: AgentQuickPickItem[] = registeredAgents.map(agent => ({
					label: agent.name,
					description: 'Registered',
					agentId: agent.id,
					status: agent
				}));

				const selected = await quickInputService.pick(items, {
					placeHolder: localize('selectAgentToDisable', 'Select an agent to disable')
				});

				if (selected) {
					await mcpServerService.disableAgent(selected.agentId);
					notificationService.info(`Disabled ${selected.label}`);
				}
			} catch (error) {
				notificationService.error(`Failed to disable agent: ${error}`);
			}
		}
	});

	// Sync Agent Registrations (re-sync with current settings)
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.mcp.syncAgents',
				title: localize2('roopik.mcp.syncAgents', 'Sync Agent Registrations'),
				category: localize2('roopik.category', 'Roopik'),
				f1: true
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const notificationService = accessor.get(INotificationService);
			const mcpServerService = accessor.get(IMcpServerService);

			try {
				notificationService.info('Syncing agent registrations...');
				await mcpServerService.syncAgentRegistrations();

				const agents = await mcpServerService.getAgentStatus();
				const registered = agents.filter(a => a.registered);

				notificationService.info(`Agent sync complete: ${registered.length} agents registered`);
			} catch (error) {
				notificationService.error(`Failed to sync agents: ${error}`);
			}
		}
	});

	// Show MCP Connection Info (for external IDEs)
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.mcp.showConnectionInfo',
				title: localize2('roopik.mcp.showConnectionInfo', 'Show MCP Connection Info'),
				category: localize2('roopik.category', 'Roopik'),
				f1: true
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const notificationService = accessor.get(INotificationService);
			const mcpServerService = accessor.get(IMcpServerService);
			const quickInputService = accessor.get(IQuickInputService);
			const clipboardService = accessor.get(IClipboardService);

			try {
				const connectionInfo = await mcpServerService.getConnectionInfo();

				if (!connectionInfo.isRunning) {
					notificationService.warn('MCP Server is not running. Enable it in Settings > Roopik > MCP.');
					return;
				}

				// Build the MCP config JSON that users can copy
				const mcpConfig = JSON.stringify({
					roopik: {
						command: connectionInfo.binaryPath,
						args: ['--ws-port', connectionInfo.wsPort.toString(), '--token', connectionInfo.token]
					}
				}, null, 2);

				const items: IQuickPickItem[] = [
					{
						label: '$(key) Copy Token',
						description: connectionInfo.token,
						detail: 'Copy authentication token to clipboard'
					},
					{
						label: '$(terminal) Copy MCP Config',
						description: 'JSON config for mcp_servers',
						detail: 'Copy complete MCP server config for external IDEs'
					},
					{
						label: '$(info) Connection Details',
						description: `Port: ${connectionInfo.wsPort}`,
						detail: `Binary: ${connectionInfo.binaryPath}`
					}
				];

				const selected = await quickInputService.pick(items, {
					title: 'Roopik MCP Connection Info',
					placeHolder: 'Select what to copy (token changes on IDE restart)'
				});

				if (selected) {
					if (selected.label.includes('Copy Token')) {
						await clipboardService.writeText(connectionInfo.token);
						notificationService.info('Token copied to clipboard');
					} else if (selected.label.includes('Copy MCP Config')) {
						await clipboardService.writeText(mcpConfig);
						notificationService.info('MCP config copied to clipboard');
					}
				}
			} catch (error) {
				notificationService.error(`Failed to get connection info: ${error}`);
			}
		}
	});
}
