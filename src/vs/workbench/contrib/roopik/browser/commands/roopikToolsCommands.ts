/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Roopik Tools Commands
 *
 * Bridge between VSCode extensions (agent-dio) and RoopikToolsChannel (main process).
 *
 * Architecture:
 * Extension (agent-dio) → vscode.commands.executeCommand() → These Commands → IPC → RoopikToolsChannel
 *
 * This enables:
 * 1. Extensions to call Roopik tools without direct IPC access
 * 2. Future bidirectional communication (browser events → extension)
 * 3. Consistent tool interface for AI agents
 *
 * Tool Naming Convention: category_action (e.g., browser_navigate, component_add)
 */

import { registerAction2, Action2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { ROOPIK_TOOLS_CHANNEL_NAME, RoopikToolResult } from '../../common/tools/types.js';

/**
 * Generic tool call interface for extensions
 */
interface ToolCallArgs {
	tool: string;
	args?: Record<string, unknown>;
}

/**
 * Create an IPC proxy for the RoopikToolsChannel
 */
function getToolsChannel(mainProcessService: IMainProcessService) {
	return mainProcessService.getChannel(ROOPIK_TOOLS_CHANNEL_NAME);
}

/**
 * Register all Roopik tool commands
 *
 * These commands are the bridge that extensions use to call Roopik IDE tools.
 */
export function registerRoopikToolsCommands(): void {

	// ============================================================================
	// UNIFIED TOOL EXECUTOR
	// Extensions call: vscode.commands.executeCommand('roopik.executeTool', { tool: 'browser_screenshot', args: {} })
	// ============================================================================
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.executeTool',
				title: { value: 'Execute Roopik Tool', original: 'Execute Roopik Tool' },
				category: { value: 'Roopik', original: 'Roopik' },
				f1: false // Not shown in command palette
			});
		}

		async run(accessor: ServicesAccessor, args?: ToolCallArgs): Promise<RoopikToolResult> {
			if (!args?.tool) {
				return { success: false, error: 'Tool name is required' };
			}

			const mainProcessService = accessor.get(IMainProcessService);
			const channel = getToolsChannel(mainProcessService);

			try {
				return await channel.call(args.tool, args.args);
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error)
				};
			}
		}
	});

	// ============================================================================
	// INDIVIDUAL TOOL COMMANDS (for direct command access)
	// These provide type-safe interfaces for each tool
	// ============================================================================

	// --------------------------------------------------------------------------
	// Browser Tools (10)
	// --------------------------------------------------------------------------

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.tools.browserOpen',
				title: { value: 'Open Browser', original: 'Open Browser' },
				category: { value: 'Roopik', original: 'Roopik' },
				f1: false
			});
		}

		async run(accessor: ServicesAccessor, args?: { url?: string }): Promise<RoopikToolResult> {
			const mainProcessService = accessor.get(IMainProcessService);
			const channel = getToolsChannel(mainProcessService);
			return channel.call('browser_open', args || {});
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.tools.navigate',
				title: { value: 'Navigate Browser', original: 'Navigate Browser' },
				category: { value: 'Roopik', original: 'Roopik' },
				f1: false
			});
		}

		async run(accessor: ServicesAccessor, args?: { url: string }): Promise<RoopikToolResult> {
			if (!args?.url) {
				return { success: false, error: 'URL is required' };
			}
			const mainProcessService = accessor.get(IMainProcessService);
			const channel = getToolsChannel(mainProcessService);
			return channel.call('browser_navigate', args);
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.tools.reload',
				title: { value: 'Reload Browser Page', original: 'Reload Browser Page' },
				category: { value: 'Roopik', original: 'Roopik' },
				f1: false
			});
		}

		async run(accessor: ServicesAccessor, args?: { ignoreCache?: boolean }): Promise<RoopikToolResult> {
			const mainProcessService = accessor.get(IMainProcessService);
			const channel = getToolsChannel(mainProcessService);
			return channel.call('browser_reload', args || {});
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.tools.screenshot',
				title: { value: 'Take Browser Screenshot', original: 'Take Browser Screenshot' },
				category: { value: 'Roopik', original: 'Roopik' },
				f1: false
			});
		}

		async run(accessor: ServicesAccessor): Promise<RoopikToolResult> {
			const mainProcessService = accessor.get(IMainProcessService);
			const channel = getToolsChannel(mainProcessService);
			return channel.call('browser_screenshot');
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.tools.executeScript',
				title: { value: 'Execute Script in Browser', original: 'Execute Script in Browser' },
				category: { value: 'Roopik', original: 'Roopik' },
				f1: false
			});
		}

		async run(accessor: ServicesAccessor, args?: { script: string }): Promise<RoopikToolResult> {
			if (!args?.script) {
				return { success: false, error: 'Script is required' };
			}
			const mainProcessService = accessor.get(IMainProcessService);
			const channel = getToolsChannel(mainProcessService);
			return channel.call('browser_execute_script', args);
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.tools.inspectElement',
				title: { value: 'Inspect Element in Browser', original: 'Inspect Element in Browser' },
				category: { value: 'Roopik', original: 'Roopik' },
				f1: false
			});
		}

		async run(accessor: ServicesAccessor, args?: { selector: string; includeInherited?: boolean }): Promise<RoopikToolResult> {
			if (!args?.selector) {
				return { success: false, error: 'Selector is required' };
			}
			const mainProcessService = accessor.get(IMainProcessService);
			const channel = getToolsChannel(mainProcessService);
			return channel.call('browser_inspect_element', args);
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.tools.getErrors',
				title: { value: 'Get Browser Errors', original: 'Get Browser Errors' },
				category: { value: 'Roopik', original: 'Roopik' },
				f1: false
			});
		}

		async run(accessor: ServicesAccessor, args?: { limit?: number }): Promise<RoopikToolResult> {
			const mainProcessService = accessor.get(IMainProcessService);
			const channel = getToolsChannel(mainProcessService);
			return channel.call('browser_get_errors', args || {});
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.tools.getConsoleLogs',
				title: { value: 'Get Console Logs', original: 'Get Console Logs' },
				category: { value: 'Roopik', original: 'Roopik' },
				f1: false
			});
		}

		async run(accessor: ServicesAccessor, args?: { limit?: number; type?: string }): Promise<RoopikToolResult> {
			const mainProcessService = accessor.get(IMainProcessService);
			const channel = getToolsChannel(mainProcessService);
			return channel.call('browser_get_console_logs', args || {});
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.tools.browserGetPerformance',
				title: { value: 'Get Browser Performance Metrics', original: 'Get Browser Performance Metrics' },
				category: { value: 'Roopik', original: 'Roopik' },
				f1: false
			});
		}

		async run(accessor: ServicesAccessor): Promise<RoopikToolResult> {
			const mainProcessService = accessor.get(IMainProcessService);
			const channel = getToolsChannel(mainProcessService);
			return channel.call('browser_get_performance');
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.tools.browserGetCdpInfo',
				title: { value: 'Get Browser CDP Info', original: 'Get Browser CDP Info' },
				category: { value: 'Roopik', original: 'Roopik' },
				f1: false
			});
		}

		async run(accessor: ServicesAccessor): Promise<RoopikToolResult> {
			const mainProcessService = accessor.get(IMainProcessService);
			const channel = getToolsChannel(mainProcessService);
			return channel.call('browser_get_cdp_info');
		}
	});

	// --------------------------------------------------------------------------
	// Project Tools (3)
	// --------------------------------------------------------------------------

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.tools.getActiveProject',
				title: { value: 'Get Active Project', original: 'Get Active Project' },
				category: { value: 'Roopik', original: 'Roopik' },
				f1: false
			});
		}

		async run(accessor: ServicesAccessor): Promise<RoopikToolResult> {
			const mainProcessService = accessor.get(IMainProcessService);
			const channel = getToolsChannel(mainProcessService);
			return channel.call('project_get_active');
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.tools.startProject',
				title: { value: 'Start Project', original: 'Start Project' },
				category: { value: 'Roopik', original: 'Roopik' },
				f1: false
			});
		}

		async run(accessor: ServicesAccessor, args?: { projectPath: string; port?: number }): Promise<RoopikToolResult> {
			if (!args?.projectPath) {
				return { success: false, error: 'Project path is required' };
			}
			const mainProcessService = accessor.get(IMainProcessService);
			const channel = getToolsChannel(mainProcessService);
			return channel.call('project_start', args);
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.tools.stopProject',
				title: { value: 'Stop Project', original: 'Stop Project' },
				category: { value: 'Roopik', original: 'Roopik' },
				f1: false
			});
		}

		async run(accessor: ServicesAccessor): Promise<RoopikToolResult> {
			const mainProcessService = accessor.get(IMainProcessService);
			const channel = getToolsChannel(mainProcessService);
			return channel.call('project_stop');
		}
	});

	// --------------------------------------------------------------------------
	// Canvas Tools (3)
	// --------------------------------------------------------------------------

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.tools.listCanvases',
				title: { value: 'List Canvases', original: 'List Canvases' },
				category: { value: 'Roopik', original: 'Roopik' },
				f1: false
			});
		}

		async run(accessor: ServicesAccessor, args?: { nameFilter?: string; sortBy?: string; sortDirection?: string }): Promise<RoopikToolResult> {
			const mainProcessService = accessor.get(IMainProcessService);
			const channel = getToolsChannel(mainProcessService);
			return channel.call('canvas_list', args || {});
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.tools.getActiveCanvas',
				title: { value: 'Get Active Canvas', original: 'Get Active Canvas' },
				category: { value: 'Roopik', original: 'Roopik' },
				f1: false
			});
		}

		async run(accessor: ServicesAccessor): Promise<RoopikToolResult> {
			const mainProcessService = accessor.get(IMainProcessService);
			const channel = getToolsChannel(mainProcessService);
			return channel.call('canvas_get_active');
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.tools.createCanvas',
				title: { value: 'Create Canvas', original: 'Create Canvas' },
				category: { value: 'Roopik', original: 'Roopik' },
				f1: false
			});
		}

		async run(accessor: ServicesAccessor, args?: { name: string }): Promise<RoopikToolResult> {
			if (!args?.name) {
				return { success: false, error: 'Canvas name is required' };
			}
			const mainProcessService = accessor.get(IMainProcessService);
			const channel = getToolsChannel(mainProcessService);
			return channel.call('canvas_create', args);
		}
	});

	// --------------------------------------------------------------------------
	// Component Tools (6)
	// --------------------------------------------------------------------------

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.tools.addComponent',
				title: { value: 'Add Component', original: 'Add Component' },
				category: { value: 'Roopik', original: 'Roopik' },
				f1: false
			});
		}

		async run(accessor: ServicesAccessor, args?: {
			folderPath: string;
			canvasId?: string;
			name?: string;
			entryFile?: string;
			framework?: string;
		}): Promise<RoopikToolResult> {
			if (!args?.folderPath) {
				return { success: false, error: 'Folder path is required' };
			}
			const mainProcessService = accessor.get(IMainProcessService);
			const channel = getToolsChannel(mainProcessService);
			return channel.call('component_add', args);
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.tools.addComponents',
				title: { value: 'Add Multiple Components', original: 'Add Multiple Components' },
				category: { value: 'Roopik', original: 'Roopik' },
				f1: false
			});
		}

		async run(accessor: ServicesAccessor, args?: {
			components: Array<{
				folderPath: string;
				canvasId?: string;
				name?: string;
				entryFile?: string;
				framework?: string;
			}>;
		}): Promise<RoopikToolResult> {
			if (!args?.components || args.components.length === 0) {
				return { success: false, error: 'Components array is required' };
			}
			const mainProcessService = accessor.get(IMainProcessService);
			const channel = getToolsChannel(mainProcessService);
			return channel.call('component_add_batch', args);
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.tools.removeComponent',
				title: { value: 'Remove Component', original: 'Remove Component' },
				category: { value: 'Roopik', original: 'Roopik' },
				f1: false
			});
		}

		async run(accessor: ServicesAccessor, args?: { componentId: string }): Promise<RoopikToolResult> {
			if (!args?.componentId) {
				return { success: false, error: 'Component ID is required' };
			}
			const mainProcessService = accessor.get(IMainProcessService);
			const channel = getToolsChannel(mainProcessService);
			return channel.call('component_remove', args);
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.tools.getComponentInfo',
				title: { value: 'Get Component Info', original: 'Get Component Info' },
				category: { value: 'Roopik', original: 'Roopik' },
				f1: false
			});
		}

		async run(accessor: ServicesAccessor, args?: { componentId: string }): Promise<RoopikToolResult> {
			if (!args?.componentId) {
				return { success: false, error: 'Component ID is required' };
			}
			const mainProcessService = accessor.get(IMainProcessService);
			const channel = getToolsChannel(mainProcessService);
			return channel.call('component_get_info', args);
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.tools.listComponents',
				title: { value: 'List Components', original: 'List Components' },
				category: { value: 'Roopik', original: 'Roopik' },
				f1: false
			});
		}

		async run(accessor: ServicesAccessor, args?: { canvasId: string }): Promise<RoopikToolResult> {
			if (!args?.canvasId) {
				return { success: false, error: 'Canvas ID is required' };
			}
			const mainProcessService = accessor.get(IMainProcessService);
			const channel = getToolsChannel(mainProcessService);
			return channel.call('component_list', args);
		}
	});

	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'roopik.tools.rebuildComponent',
				title: { value: 'Rebuild Component', original: 'Rebuild Component' },
				category: { value: 'Roopik', original: 'Roopik' },
				f1: false
			});
		}

		async run(accessor: ServicesAccessor, args?: { componentId: string }): Promise<RoopikToolResult> {
			if (!args?.componentId) {
				return { success: false, error: 'Component ID is required' };
			}
			const mainProcessService = accessor.get(IMainProcessService);
			const channel = getToolsChannel(mainProcessService);
			return channel.call('component_rebuild', args);
		}
	});

	console.log('[Roopik] Registered 22 tool bridge commands for agent-dio');
}
