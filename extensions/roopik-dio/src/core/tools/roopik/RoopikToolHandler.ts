/**
 * RoopikToolHandler
 *
 * Handles Roopik IDE tool calls from the LLM.
 * Dispatches XML-parsed parameters to RoopikToolClient and formats responses.
 *
 * Architecture:
 * LLM → XML Tool Call → RoopikToolHandler → RoopikToolClient → VSCode Commands → IPC → Core
 */

import { Task } from "../../task/Task"
import type { ToolUse, ToolResponse, HandleError, PushToolResult, RemoveClosingTag, AskApproval } from "../../../shared/tools"
import { formatResponse } from "../../prompts/responses"
import { roopikClient, RoopikToolResult } from "../../../services/roopik"
import { isRoopikTool, type RoopikToolName } from "../../prompts/tools/roopik"
import { Anthropic } from "@anthropic-ai/sdk"

/**
 * Tool callbacks passed from the main tool executor
 */
interface ToolCallbacks {
	askApproval: AskApproval
	handleError: HandleError
	pushToolResult: PushToolResult
	removeClosingTag: RemoveClosingTag
}

/**
 * Handle a Roopik tool call
 *
 * @param task - The current task
 * @param block - The tool use block from the LLM
 * @param callbacks - Tool callbacks for approval, errors, and results
 */
export async function handleRoopikTool(
	task: Task,
	block: ToolUse,
	callbacks: ToolCallbacks
): Promise<void> {
	const { askApproval, handleError, pushToolResult, removeClosingTag } = callbacks
	const toolName = block.name as RoopikToolName

	// Handle partial streaming (show pending state in UI)
	if (block.partial) {
		await handleRoopikToolPartial(task, block, callbacks)
		return
	}

	try {
		// Check if Roopik IDE is available
		const isAvailable = await roopikClient.isAvailable()
		if (!isAvailable) {
			pushToolResult(formatResponse.toolError(
				"Roopik IDE is not available. Make sure you're running inside Roopik IDE."
			))
			return
		}

		// Ask for approval before executing the tool
		const approvalMessage = JSON.stringify({
			tool: toolName,
			...block.params,
		})
		const didApprove = await askApproval("tool", approvalMessage)
		if (!didApprove) {
			pushToolResult(formatResponse.toolDenied())
			return
		}

		// Dispatch to appropriate handler
		let result: RoopikToolResult

		switch (toolName) {
			// Browser Tools
			case "rpk_screenshot":
				result = await handleScreenshot(task, block, callbacks)
				break
			case "rpk_navigate":
				result = await handleNavigate(task, block, callbacks)
				break
			case "rpk_reload":
				result = await handleReload(task, block, callbacks)
				break
			case "rpk_executeScript":
				result = await handleExecuteScript(task, block, callbacks)
				break
			case "rpk_inspectElement":
				result = await handleInspectElement(task, block, callbacks)
				break

			// CDP Tools
			case "rpk_getErrors":
				result = await handleGetErrors(task, block, callbacks)
				break
			case "rpk_getConsoleLogs":
				result = await handleGetConsoleLogs(task, block, callbacks)
				break

			// Project Tools
			case "rpk_getActiveProject":
				result = await handleGetActiveProject(task, block, callbacks)
				break
			case "rpk_startProject":
				result = await handleStartProject(task, block, callbacks)
				break
			case "rpk_stopProject":
				result = await handleStopProject(task, block, callbacks)
				break

			// Canvas Tools
			case "rpk_listCanvases":
				result = await handleListCanvases(task, block, callbacks)
				break
			case "rpk_getActiveCanvas":
				result = await handleGetActiveCanvas(task, block, callbacks)
				break
			case "rpk_createCanvas":
				result = await handleCreateCanvas(task, block, callbacks)
				break

			// Component Tools
			case "rpk_addComponent":
				result = await handleAddComponent(task, block, callbacks)
				break
			case "rpk_addComponents":
				result = await handleAddComponents(task, block, callbacks)
				break
			case "rpk_removeComponent":
				result = await handleRemoveComponent(task, block, callbacks)
				break
			case "rpk_getComponentInfo":
				result = await handleGetComponentInfo(task, block, callbacks)
				break
			case "rpk_listComponents":
				result = await handleListComponents(task, block, callbacks)
				break
			case "rpk_rebuildComponent":
				result = await handleRebuildComponent(task, block, callbacks)
				break

			default:
				result = { success: false, error: `Unknown Roopik tool: ${toolName}` }
		}

		// Format and push result
		if (result.success) {
			pushToolResult(formatToolResult(toolName, result))
		} else {
			task.recordToolError(toolName)
			task.didToolFailInCurrentTurn = true
			pushToolResult(formatResponse.toolError(result.error || "Tool execution failed"))
		}
	} catch (error) {
		await handleError(`executing ${toolName}`, error instanceof Error ? error : new Error(String(error)))
	}
}

/**
 * Handle partial (streaming) tool messages
 */
async function handleRoopikToolPartial(
	task: Task,
	block: ToolUse,
	callbacks: ToolCallbacks
): Promise<void> {
	const { removeClosingTag } = callbacks
	const toolName = block.name

	// Show tool in progress in UI
	// For most Roopik tools, we just show that we're calling the tool
	const params = block.params
	let displayMessage = ""

	switch (toolName) {
		case "rpk_navigate":
			displayMessage = `Navigating to: ${removeClosingTag("url", params.url)}`
			break
		case "rpk_executeScript":
			displayMessage = `Executing script...`
			break
		case "rpk_inspectElement":
			displayMessage = `Inspecting: ${removeClosingTag("selector", params.args || params.path)}`
			break
		case "rpk_startProject":
			displayMessage = `Starting project: ${removeClosingTag("projectPath", params.path || params.args)}`
			break
		case "rpk_createCanvas":
			displayMessage = `Creating canvas: ${removeClosingTag("name", params.args)}`
			break
		case "rpk_addComponent":
			displayMessage = `Adding component: ${removeClosingTag("folderPath", params.path || params.args)}`
			break
		default:
			displayMessage = `Running ${toolName}...`
	}

	// Use task.ask to show the partial message (for approval UI)
	await task.ask("tool", JSON.stringify({ tool: toolName, ...params }), block.partial).catch(() => {})
}

// ============================================================================
// Browser Tool Handlers
// ============================================================================

async function handleScreenshot(task: Task, block: ToolUse, callbacks: ToolCallbacks): Promise<RoopikToolResult> {
	return roopikClient.screenshot()
}

async function handleNavigate(task: Task, block: ToolUse, callbacks: ToolCallbacks): Promise<RoopikToolResult> {
	const url = block.params.url || block.params.args
	if (!url) {
		return { success: false, error: "Missing required parameter: url" }
	}
	return roopikClient.navigate(url)
}

async function handleReload(task: Task, block: ToolUse, callbacks: ToolCallbacks): Promise<RoopikToolResult> {
	const ignoreCache = block.params.args?.toLowerCase() === "true" || block.params.ignoreCache?.toLowerCase() === "true"
	return roopikClient.reload(ignoreCache)
}

async function handleExecuteScript(task: Task, block: ToolUse, callbacks: ToolCallbacks): Promise<RoopikToolResult> {
	const script = block.params.script || block.params.args || block.params.content
	if (!script) {
		return { success: false, error: "Missing required parameter: script" }
	}
	return roopikClient.executeScript(script)
}

async function handleInspectElement(task: Task, block: ToolUse, callbacks: ToolCallbacks): Promise<RoopikToolResult> {
	const selector = block.params.selector || block.params.args || block.params.path
	if (!selector) {
		return { success: false, error: "Missing required parameter: selector" }
	}
	const includeInherited = block.params.includeInherited?.toLowerCase() !== "false"
	return roopikClient.inspectElement(selector, includeInherited)
}

// ============================================================================
// CDP Tool Handlers
// ============================================================================

async function handleGetErrors(task: Task, block: ToolUse, callbacks: ToolCallbacks): Promise<RoopikToolResult> {
	const limit = block.params.limit ? parseInt(block.params.limit, 10) : undefined
	return roopikClient.getErrors(limit)
}

async function handleGetConsoleLogs(task: Task, block: ToolUse, callbacks: ToolCallbacks): Promise<RoopikToolResult> {
	const limit = block.params.limit ? parseInt(block.params.limit, 10) : undefined
	const type = block.params.type as "log" | "debug" | "info" | "warn" | "error" | undefined
	return roopikClient.getConsoleLogs(limit, type)
}

// ============================================================================
// Project Tool Handlers
// ============================================================================

async function handleGetActiveProject(task: Task, block: ToolUse, callbacks: ToolCallbacks): Promise<RoopikToolResult> {
	return roopikClient.getActiveProject()
}

async function handleStartProject(task: Task, block: ToolUse, callbacks: ToolCallbacks): Promise<RoopikToolResult> {
	const projectPath = block.params.projectPath || block.params.path || block.params.args
	if (!projectPath) {
		return { success: false, error: "Missing required parameter: projectPath" }
	}
	const port = block.params.port ? parseInt(block.params.port, 10) : undefined
	return roopikClient.startProject(projectPath, port)
}

async function handleStopProject(task: Task, block: ToolUse, callbacks: ToolCallbacks): Promise<RoopikToolResult> {
	return roopikClient.stopProject()
}

// ============================================================================
// Canvas Tool Handlers
// ============================================================================

async function handleListCanvases(task: Task, block: ToolUse, callbacks: ToolCallbacks): Promise<RoopikToolResult> {
	return roopikClient.listCanvases({
		nameFilter: block.params.nameFilter,
		sortBy: block.params.sortBy as any,
		sortDirection: block.params.sortDirection as any,
	})
}

async function handleGetActiveCanvas(task: Task, block: ToolUse, callbacks: ToolCallbacks): Promise<RoopikToolResult> {
	return roopikClient.getActiveCanvas()
}

async function handleCreateCanvas(task: Task, block: ToolUse, callbacks: ToolCallbacks): Promise<RoopikToolResult> {
	const name = block.params.name || block.params.args
	if (!name) {
		return { success: false, error: "Missing required parameter: name" }
	}
	return roopikClient.createCanvas(name)
}

// ============================================================================
// Component Tool Handlers
// ============================================================================

async function handleAddComponent(task: Task, block: ToolUse, callbacks: ToolCallbacks): Promise<RoopikToolResult> {
	const folderPath = block.params.folderPath || block.params.path || block.params.args
	if (!folderPath) {
		return { success: false, error: "Missing required parameter: folderPath" }
	}
	return roopikClient.addComponent({
		folderPath,
		canvasId: block.params.canvasId,
		name: block.params.name,
		entryFile: block.params.entryFile,
		framework: block.params.framework,
	})
}

async function handleAddComponents(task: Task, block: ToolUse, callbacks: ToolCallbacks): Promise<RoopikToolResult> {
	const componentsJson = block.params.components || block.params.args
	if (!componentsJson) {
		return { success: false, error: "Missing required parameter: components" }
	}

	try {
		const components = JSON.parse(componentsJson)
		if (!Array.isArray(components)) {
			return { success: false, error: "components must be an array" }
		}
		return roopikClient.addComponents(components)
	} catch (e) {
		return { success: false, error: `Invalid JSON in components: ${e}` }
	}
}

async function handleRemoveComponent(task: Task, block: ToolUse, callbacks: ToolCallbacks): Promise<RoopikToolResult> {
	const componentId = block.params.componentId || block.params.args
	if (!componentId) {
		return { success: false, error: "Missing required parameter: componentId" }
	}
	return roopikClient.removeComponent(componentId)
}

async function handleGetComponentInfo(task: Task, block: ToolUse, callbacks: ToolCallbacks): Promise<RoopikToolResult> {
	const componentId = block.params.componentId || block.params.args
	if (!componentId) {
		return { success: false, error: "Missing required parameter: componentId" }
	}
	return roopikClient.getComponentInfo(componentId)
}

async function handleListComponents(task: Task, block: ToolUse, callbacks: ToolCallbacks): Promise<RoopikToolResult> {
	const canvasId = block.params.canvasId || block.params.args
	if (!canvasId) {
		return { success: false, error: "Missing required parameter: canvasId" }
	}
	return roopikClient.listComponents(canvasId)
}

async function handleRebuildComponent(task: Task, block: ToolUse, callbacks: ToolCallbacks): Promise<RoopikToolResult> {
	const componentId = block.params.componentId || block.params.args
	if (!componentId) {
		return { success: false, error: "Missing required parameter: componentId" }
	}
	return roopikClient.rebuildComponent(componentId)
}

// ============================================================================
// Result Formatting
// ============================================================================

/**
 * Format tool result for the LLM response
 */
function formatToolResult(toolName: RoopikToolName, result: RoopikToolResult): ToolResponse {
	const data = result.data

	// Special handling for screenshot - include the image
	if (toolName === "rpk_screenshot" && data && typeof data === "object" && "image" in data) {
		const imageData = data as { image: string; format: string }
		const blocks: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = []

		// Add the image
		if (imageData.image) {
			// Image is a data URL, extract base64 part
			const base64Match = imageData.image.match(/^data:image\/(\w+);base64,(.+)$/)
			if (base64Match) {
				blocks.push({
					type: "image",
					source: {
						type: "base64",
						media_type: `image/${base64Match[1]}` as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
						data: base64Match[2],
					},
				})
			}
		}

		// Add text description
		blocks.push({
			type: "text",
			text: "Screenshot captured successfully. The image shows the current state of the browser preview.",
		})

		return blocks
	}

	// For all other tools, return JSON
	return JSON.stringify(data, null, 2)
}

/**
 * Check if a tool name is a Roopik tool
 */
export { isRoopikTool }
