/**
 * RoopikToolClient
 *
 * Client for calling Roopik IDE tools from agent-dio extension.
 * Communicates with Roopik core via VSCode commands → IPC channel.
 *
 * Architecture:
 * RoopikToolClient → vscode.commands.executeCommand() → roopikToolsCommands → IPC → RoopikToolsChannel
 *
 * Usage:
 * ```typescript
 * const client = RoopikToolClient.getInstance();
 * const result = await client.screenshot();
 * if (result.success) {
 *   console.log('Screenshot:', result.data.image);
 * }
 * ```
 */

import * as vscode from "vscode"

// ============================================================================
// Types
// ============================================================================

/**
 * Standard result format from Roopik tools
 */
export interface RoopikToolResult<T = unknown> {
	success: boolean
	data?: T
	error?: string
}

/**
 * Screenshot result data
 */
export interface ScreenshotData {
	image: string // base64 data URL
	format: "data-url"
}

/**
 * Navigation result data
 */
export interface NavigateData {
	url: string
	message: string
}

/**
 * Reload result data
 */
export interface ReloadData {
	hardReload: boolean
	message: string
}

/**
 * Execute script result data
 */
export interface ExecuteScriptData {
	result: unknown
}

/**
 * Element inspection data - THE MOAT
 */
export interface InspectElementData {
	selector: string
	element: {
		tag: string
		classes: string[]
		componentName?: string
		componentSource?: string
	}
	matchedRules?: Array<{
		selector: string
		file?: string
		location?: string
		properties: Record<string, string>
		specificity?: string
		origin?: string
	}>
	inlineStyles?: Record<string, string>
	inheritedStyles?: Record<string, unknown>
	properties?: Record<string, string>
	cssInJs?: unknown
}

/**
 * Console/Network errors data
 */
export interface ErrorsData {
	errorCount: number
	consoleErrorCount: number
	networkErrorCount: number
	errors: Array<{
		source: "console" | "network"
		type: string
		message: string
		location?: string
		url?: string
		method?: string
		timestamp: number
	}>
}

/**
 * Console logs data
 */
export interface ConsoleLogsData {
	count: number
	total: number
	logs: Array<{
		type: string
		message: string
		location?: string
		timestamp: number
	}>
}

/**
 * Active project data
 */
export interface ActiveProjectData {
	hasActiveProject: boolean
	projectPath?: string
	url?: string
	port?: number
	state?: string
	framework?: string
	frameworkDisplayName?: string
	message?: string
}

/**
 * Start project result data
 */
export interface StartProjectData {
	url: string
	projectPath: string
	message: string
}

/**
 * Stop project result data
 */
export interface StopProjectData {
	projectPath?: string
	message: string
}

/**
 * Canvas summary (for list operations)
 */
export interface CanvasSummary {
	id: string
	name: string
	componentCount: number
	description?: string
	icon?: string
	color?: string
	createdAt?: string
	updatedAt?: string
}

/**
 * List canvases result data
 */
export interface ListCanvasesData {
	canvases: CanvasSummary[]
	count: number
}

/**
 * Active canvas data
 */
export interface ActiveCanvasData {
	activeCanvas: (CanvasSummary & {
		isOpen?: boolean
		isFocused?: boolean
	}) | null
	message?: string
}

/**
 * Create canvas result data
 */
export interface CreateCanvasData {
	canvasId: string
	isNew: boolean
	canvas: CanvasSummary
	message: string
}

/**
 * Component summary
 */
export interface ComponentSummary {
	id: string
	canvasId?: string
	componentName?: string
	folderPath?: string
	entryFile?: string
	framework?: string
	buildState?: string
}

/**
 * Add component result data
 */
export interface AddComponentData {
	component: ComponentSummary & {
		contentHash?: string
		origin?: string
		createdAt?: string
		updatedAt?: string
	}
}

/**
 * Add multiple components result data
 */
export interface AddComponentsData {
	count: number
	components: ComponentSummary[]
}

/**
 * Remove component result data
 */
export interface RemoveComponentData {
	componentId: string
}

/**
 * Get component info result data
 */
export interface GetComponentInfoData {
	component: unknown // Full component info
}

/**
 * List components result data
 */
export interface ListComponentsData {
	canvasId: string
	components: ComponentSummary[]
}

/**
 * Rebuild component result data
 */
export interface RebuildComponentData {
	componentId: string
	message: string
}

// ============================================================================
// Client Implementation
// ============================================================================

/**
 * RoopikToolClient - Singleton client for Roopik IDE tools
 */
export class RoopikToolClient {
	private static instance: RoopikToolClient | null = null

	private constructor() {}

	/**
	 * Get the singleton instance
	 */
	static getInstance(): RoopikToolClient {
		if (!RoopikToolClient.instance) {
			RoopikToolClient.instance = new RoopikToolClient()
		}
		return RoopikToolClient.instance
	}

	/**
	 * Check if Roopik IDE is available
	 * Returns true if the roopik.executeTool command is registered
	 */
	async isAvailable(): Promise<boolean> {
		const commands = await vscode.commands.getCommands(true)
		return commands.includes("roopik.executeTool")
	}

	// ========================================================================
	// Generic Tool Execution
	// ========================================================================

	/**
	 * Execute any Roopik tool by name
	 * Use this for dynamic tool calls or tools not yet exposed via typed methods
	 */
	async executeTool<T = unknown>(
		tool: string,
		args?: Record<string, unknown>
	): Promise<RoopikToolResult<T>> {
		try {
			const result = await vscode.commands.executeCommand<RoopikToolResult<T>>(
				"roopik.executeTool",
				{ tool, args }
			)
			return result || { success: false, error: "No result from command" }
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			}
		}
	}

	// ========================================================================
	// Browser Tools
	// ========================================================================

	/**
	 * Take a screenshot of the browser
	 * Returns base64-encoded image
	 */
	async screenshot(): Promise<RoopikToolResult<ScreenshotData>> {
		return this.executeCommand<ScreenshotData>("roopik.tools.screenshot")
	}

	/**
	 * Navigate the browser to a URL
	 */
	async navigate(url: string): Promise<RoopikToolResult<NavigateData>> {
		return this.executeCommand<NavigateData>("roopik.tools.navigate", { url })
	}

	/**
	 * Reload the current page
	 * @param ignoreCache - If true, performs hard reload (clears cache)
	 */
	async reload(ignoreCache?: boolean): Promise<RoopikToolResult<ReloadData>> {
		return this.executeCommand<ReloadData>("roopik.tools.reload", { ignoreCache })
	}

	/**
	 * Execute JavaScript in the browser context
	 */
	async executeScript(script: string): Promise<RoopikToolResult<ExecuteScriptData>> {
		return this.executeCommand<ExecuteScriptData>("roopik.tools.executeScript", { script })
	}

	/**
	 * Inspect an element - THE MOAT
	 * Returns computed styles, CSS source locations, element tree
	 */
	async inspectElement(
		selector: string,
		includeInherited?: boolean
	): Promise<RoopikToolResult<InspectElementData>> {
		return this.executeCommand<InspectElementData>("roopik.tools.inspectElement", {
			selector,
			includeInherited,
		})
	}

	// ========================================================================
	// CDP Tools (Browser Debugging)
	// ========================================================================

	/**
	 * Get all errors from the browser (console errors + network failures)
	 */
	async getErrors(limit?: number): Promise<RoopikToolResult<ErrorsData>> {
		return this.executeCommand<ErrorsData>("roopik.tools.getErrors", { limit })
	}

	/**
	 * Get console logs from the browser
	 */
	async getConsoleLogs(
		limit?: number,
		type?: "log" | "debug" | "info" | "warn" | "error"
	): Promise<RoopikToolResult<ConsoleLogsData>> {
		return this.executeCommand<ConsoleLogsData>("roopik.tools.getConsoleLogs", { limit, type })
	}

	// ========================================================================
	// Project Tools
	// ========================================================================

	/**
	 * Get information about the currently running project
	 */
	async getActiveProject(): Promise<RoopikToolResult<ActiveProjectData>> {
		return this.executeCommand<ActiveProjectData>("roopik.tools.getActiveProject")
	}

	/**
	 * Start a project (dev server + browser)
	 */
	async startProject(
		projectPath: string,
		port?: number
	): Promise<RoopikToolResult<StartProjectData>> {
		return this.executeCommand<StartProjectData>("roopik.tools.startProject", {
			projectPath,
			port,
		})
	}

	/**
	 * Stop the currently running project
	 */
	async stopProject(): Promise<RoopikToolResult<StopProjectData>> {
		return this.executeCommand<StopProjectData>("roopik.tools.stopProject")
	}

	// ========================================================================
	// Canvas Tools
	// ========================================================================

	/**
	 * List all canvases
	 */
	async listCanvases(options?: {
		nameFilter?: string
		sortBy?: "name" | "createdAt" | "updatedAt"
		sortDirection?: "asc" | "desc"
	}): Promise<RoopikToolResult<ListCanvasesData>> {
		return this.executeCommand<ListCanvasesData>("roopik.tools.listCanvases", options)
	}

	/**
	 * Get the currently focused canvas
	 */
	async getActiveCanvas(): Promise<RoopikToolResult<ActiveCanvasData>> {
		return this.executeCommand<ActiveCanvasData>("roopik.tools.getActiveCanvas")
	}

	/**
	 * Create a new canvas
	 */
	async createCanvas(name: string): Promise<RoopikToolResult<CreateCanvasData>> {
		return this.executeCommand<CreateCanvasData>("roopik.tools.createCanvas", { name })
	}

	// ========================================================================
	// Component Tools
	// ========================================================================

	/**
	 * Add a component to a canvas
	 */
	async addComponent(options: {
		folderPath: string
		canvasId?: string
		name?: string
		entryFile?: string
		framework?: string
	}): Promise<RoopikToolResult<AddComponentData>> {
		return this.executeCommand<AddComponentData>("roopik.tools.addComponent", options)
	}

	/**
	 * Add multiple components at once
	 */
	async addComponents(
		components: Array<{
			folderPath: string
			canvasId?: string
			name?: string
			entryFile?: string
			framework?: string
		}>
	): Promise<RoopikToolResult<AddComponentsData>> {
		return this.executeCommand<AddComponentsData>("roopik.tools.addComponents", { components })
	}

	/**
	 * Remove a component from its canvas
	 */
	async removeComponent(componentId: string): Promise<RoopikToolResult<RemoveComponentData>> {
		return this.executeCommand<RemoveComponentData>("roopik.tools.removeComponent", {
			componentId,
		})
	}

	/**
	 * Get detailed information about a component
	 */
	async getComponentInfo(componentId: string): Promise<RoopikToolResult<GetComponentInfoData>> {
		return this.executeCommand<GetComponentInfoData>("roopik.tools.getComponentInfo", {
			componentId,
		})
	}

	/**
	 * List all components in a canvas
	 */
	async listComponents(canvasId: string): Promise<RoopikToolResult<ListComponentsData>> {
		return this.executeCommand<ListComponentsData>("roopik.tools.listComponents", { canvasId })
	}

	/**
	 * Trigger a rebuild of a component
	 */
	async rebuildComponent(componentId: string): Promise<RoopikToolResult<RebuildComponentData>> {
		return this.executeCommand<RebuildComponentData>("roopik.tools.rebuildComponent", {
			componentId,
		})
	}

	// ========================================================================
	// Internal Helpers
	// ========================================================================

	private async executeCommand<T>(
		command: string,
		args?: Record<string, unknown>
	): Promise<RoopikToolResult<T>> {
		try {
			const result = await vscode.commands.executeCommand<RoopikToolResult<T>>(command, args)
			return result || { success: false, error: "No result from command" }
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			}
		}
	}
}

// Export singleton instance
export const roopikClient = RoopikToolClient.getInstance()
