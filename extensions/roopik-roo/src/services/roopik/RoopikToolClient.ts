/**
 * RoopikToolClient
 *
 * Client for calling Roopik IDE tools from roopik-roo extension.
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
 * Screenshot result data (with viewport metadata for pixel-perfect clicking)
 */
export interface ScreenshotData {
	image: string // base64 data URL
	format: "data-url"
	viewport?: {
		width: number
		height: number
		devicePixelRatio: number
	}
}

/**
 * Browser action types
 */
export type BrowserActionType = "click" | "right_click" | "double_click" | "hover" | "drag" | "type" | "press" | "scroll"

/**
 * Browser action result data
 */
export interface BrowserActionData {
	action: BrowserActionType
	coordinate?: string
	x?: number
	y?: number
	text?: string
	textLength?: number
	key?: string
	modifiers?: string[]
	deltaX?: number
	deltaY?: number
	from?: { x: number; y: number }
	to?: { x: number; y: number }
	message: string
}

/**
 * Browser close result data
 */
export interface BrowserCloseData {
	message: string
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
	deletedSourceCode: boolean
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

	private constructor() { }

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
	 * Open a browser tab. If browser is already open, opens a new tab.
	 */
	async browserOpen(url?: string): Promise<RoopikToolResult<{ url?: string; message: string }>> {
		return this.executeCommand<{ url?: string; message: string }>("roopik.tools.browserOpen", url ? { url } : {})
	}

	/**
	 * Take a screenshot of a browser tab
	   * Returns base64-encoded image with viewport metadata for pixel-perfect clicking
	 */
	async screenshot(tabId?: number): Promise<RoopikToolResult<ScreenshotData>> {
		return this.executeCommand<ScreenshotData>("roopik.tools.screenshot", { tabId })
	}

	/**
	 * Close browser tabs
	 */
	async browserClose(tabId?: number): Promise<RoopikToolResult<BrowserCloseData>> {
		return this.executeCommand<BrowserCloseData>("roopik.tools.browserClose", { tabId })
	}

	/**
	 * Perform browser input actions (click, type, press, scroll, hover, drag)
	 * Coordinate format: 'x,y@WIDTHxHEIGHT' where WIDTH/HEIGHT are from screenshot viewport
	 */
	async browserAction(options: {
		action: BrowserActionType
		coordinate?: string
		text?: string
		key?: string
		modifiers?: string[]
		deltaX?: number
		deltaY?: number
		tabId?: number
	}): Promise<RoopikToolResult<BrowserActionData>> {
		return this.executeCommand<BrowserActionData>("roopik.tools.browserAction", options)
	}

	/**
	 * Get browser performance metrics from a tab including Web Vitals
	 */
	async browserGetPerformance(tabId?: number): Promise<RoopikToolResult<unknown>> {
		return this.executeCommand<unknown>("roopik.tools.browserGetPerformance", { tabId })
	}

	/**
	 * Get browser state: all tabs with URLs, titles, loading status, viewports
	 */
	async browserGetState(tabId?: number): Promise<RoopikToolResult<unknown>> {
		return this.executeCommand<unknown>("roopik.tools.browserGetState", { tabId })
	}

	/**
	 * Set or clear browser viewport override on a tab
	 * @param width Viewport width in pixels (omit to clear override)
	 * @param height Viewport height in pixels (omit to clear override)
	 * @param deviceScaleFactor Device scale factor (default: 1)
	 * @param mobile Emulate mobile device (default: false)
	 */
	async browserSetViewport(
		width?: number,
		height?: number,
		deviceScaleFactor?: number,
		mobile?: boolean,
		tabId?: number
	): Promise<RoopikToolResult<unknown>> {
		return this.executeCommand<unknown>("roopik.tools.browserSetViewport", {
			width,
			height,
			deviceScaleFactor,
			mobile,
			tabId,
		})
	}

	/**
	 * Get network requests from a tab
	 * @param options Filter options for network requests
	 */
	async browserGetNetworkRequests(options?: {
		includeStaticAssets?: boolean
		urlFilter?: string
		method?: string
		statusFilter?: "success" | "error" | "all"
		limit?: number
		tabId?: number
	}): Promise<RoopikToolResult<unknown>> {
		return this.executeCommand<unknown>("roopik.tools.browserGetNetworkRequests", options)
	}

	/**
	 * Navigate a browser tab to a URL
	 */
	async navigate(url: string, tabId?: number, waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'): Promise<RoopikToolResult<NavigateData>> {
		return this.executeCommand<NavigateData>("roopik.tools.navigate", { url, waitUntil, tabId })
	}

	/**
	 * Reload a browser tab
	 * @param ignoreCache - If true, performs hard reload (clears cache)
	*/
	async reload(ignoreCache?: boolean, tabId?: number, waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'): Promise<RoopikToolResult<ReloadData>> {
		return this.executeCommand<ReloadData>("roopik.tools.reload", { ignoreCache, waitUntil, tabId })
	}

	/**
	 * Execute JavaScript in a browser tab context
	 */
	async executeScript(script: string, tabId?: number): Promise<RoopikToolResult<ExecuteScriptData>> {
		return this.executeCommand<ExecuteScriptData>("roopik.tools.executeScript", { script, tabId })
	}

	/**
	 * Inspect CSS styles of an element with source file resolution
	 */
	async inspectElement(
		selector: string,
		includeInherited?: boolean,
		tabId?: number
	): Promise<RoopikToolResult<InspectElementData>> {
		return this.executeCommand<InspectElementData>("roopik.tools.inspectElement", {
			selector,
			includeInherited,
			tabId,
		})
	}

	// ========================================================================
	// CDP Tools (Browser Debugging)
	// ========================================================================

	/**
	 * Get console errors and network failures from a tab
	 */
	async getErrors(limit?: number, tabId?: number): Promise<RoopikToolResult<ErrorsData>> {
		return this.executeCommand<ErrorsData>("roopik.tools.getErrors", { limit, tabId })
	}

	/**
	 * Get console logs from a browser tab
	 */
	async getConsoleLogs(
		limit?: number,
		type?: "log" | "debug" | "info" | "warn" | "error",
		tabId?: number
	): Promise<RoopikToolResult<ConsoleLogsData>> {
		return this.executeCommand<ConsoleLogsData>("roopik.tools.getConsoleLogs", { limit, type, tabId })
	}

	/**
	 * Find elements using smart selectors
	 */
	async browserFindElement(selector: string, tabId?: number): Promise<RoopikToolResult<unknown>> {
		return this.executeCommand("roopik.tools.browserFindElement", { selector, tabId })
	}

	/**
	 * Wait for a selector to appear and become visible
	 */
	async browserWaitForElement(selector: string, timeout?: number, tabId?: number): Promise<RoopikToolResult<unknown>> {
		return this.executeCommand("roopik.tools.browserWaitForElement", { selector, timeout, tabId })
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

	/**
	 * Open an existing canvas by ID or name
	 */
	async openCanvas(canvasId?: string, name?: string): Promise<RoopikToolResult<unknown>> {
		return this.executeCommand<unknown>("roopik.tools.openCanvas", { canvasId, name })
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
	 * @param componentId The component's unique ID
	 * @param deleteSourceCode If true, also delete the source code files from disk (default: false)
	 */
	async removeComponent(componentId: string, deleteSourceCode?: boolean): Promise<RoopikToolResult<RemoveComponentData>> {
		return this.executeCommand<RemoveComponentData>("roopik.tools.removeComponent", {
			componentId,
			deleteSourceCode,
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

	/**
	 * Validate all components in a canvas
	 * Returns summary (total, success, failed, building) + detailed errors for failed components
	 */
	async validateComponents(canvasId?: string): Promise<RoopikToolResult<unknown>> {
		return this.executeCommand<unknown>("roopik.tools.validateComponents", {
			canvasId,
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
