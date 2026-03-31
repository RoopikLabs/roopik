/**
 * RoopikToolHandler
 *
 * Handles Roopik IDE tool calls from the LLM.
 * Dispatches native tool parameters to RoopikToolClient and formats responses.
 *
 * Architecture:
 * LLM → Native Tool Call → RoopikToolHandler → RoopikToolClient → VSCode Commands → IPC → Core
 */
import { formatResponse } from "../../prompts/responses";
import { roopikClient } from "../../../services/roopik";
import { isRoopikTool } from "../../prompts/tools/roopik/roopik-tools";
/**
 * Handle a Roopik tool call
 *
 * @param task - The current task
 * @param block - The tool use block from the LLM
 * @param callbacks - Tool callbacks for approval, errors, and results
 */
export async function handleRoopikTool(task, block, callbacks) {
    const { askApproval, handleError, pushToolResult } = callbacks;
    const toolName = block.name;
    // Handle partial streaming (show pending state in UI)
    if (block.partial) {
        await handleRoopikToolPartial(task, block, callbacks);
        return;
    }
    try {
        // Check if Roopik IDE is available
        const isAvailable = await roopikClient.isAvailable();
        if (!isAvailable) {
            pushToolResult(formatResponse.toolError("Roopik IDE is not available. Make sure you're running inside Roopik IDE."));
            return;
        }
        // Ask for approval before executing the tool
        const approvalMessage = JSON.stringify({
            tool: toolName,
            ...block.params,
        });
        const didApprove = await askApproval("tool", approvalMessage);
        if (!didApprove) {
            pushToolResult(formatResponse.toolDenied());
            return;
        }
        // Dispatch to appropriate handler
        let result;
        switch (toolName) {
            // Browser Tools (14)
            case "browser_open":
                result = await handleBrowserOpen(task, block, callbacks);
                break;
            case "browser_close":
                result = await handleBrowserClose(task, block, callbacks);
                break;
            case "browser_action_input":
                result = await handleBrowserActionInput(task, block, callbacks);
                break;
            case "browser_navigate":
                result = await handleNavigate(task, block, callbacks);
                break;
            case "browser_reload":
                result = await handleReload(task, block, callbacks);
                break;
            case "browser_screenshot":
                result = await handleScreenshot(task, block, callbacks);
                break;
            case "browser_execute_script":
                result = await handleExecuteScript(task, block, callbacks);
                break;
            case "browser_inspect_element":
                result = await handleInspectElement(task, block, callbacks);
                break;
            case "browser_get_errors":
                result = await handleGetErrors(task, block, callbacks);
                break;
            case "browser_get_console_logs":
                result = await handleGetConsoleLogs(task, block, callbacks);
                break;
            case "browser_get_performance":
                result = await handleBrowserGetPerformance(task, block, callbacks);
                break;
            case "browser_get_state":
                result = await handleBrowserGetState(task, block, callbacks);
                break;
            case "browser_set_viewport":
                result = await handleBrowserSetViewport(task, block, callbacks);
                break;
            case "browser_get_network_requests":
                result = await handleBrowserGetNetworkRequests(task, block, callbacks);
                break;
            // Project Tools (3)
            case "project_get_active":
                result = await handleGetActiveProject(task, block, callbacks);
                break;
            case "project_start":
                result = await handleStartProject(task, block, callbacks);
                break;
            case "project_stop":
                result = await handleStopProject(task, block, callbacks);
                break;
            // Canvas Tools (4)
            case "canvas_list":
                result = await handleListCanvases(task, block, callbacks);
                break;
            case "canvas_get_active":
                result = await handleGetActiveCanvas(task, block, callbacks);
                break;
            case "canvas_create":
                result = await handleCreateCanvas(task, block, callbacks);
                break;
            case "canvas_open":
                result = await handleOpenCanvas(task, block, callbacks);
                break;
            // Component Tools (7)
            case "component_add":
                result = await handleAddComponent(task, block, callbacks);
                break;
            case "component_add_batch":
                result = await handleAddComponents(task, block, callbacks);
                break;
            case "component_remove":
                result = await handleRemoveComponent(task, block, callbacks);
                break;
            case "component_get_info":
                result = await handleGetComponentInfo(task, block, callbacks);
                break;
            case "component_list":
                result = await handleListComponents(task, block, callbacks);
                break;
            case "component_rebuild":
                result = await handleRebuildComponent(task, block, callbacks);
                break;
            case "canvas_validate_components":
                result = await handleValidateComponents(task, block, callbacks);
                break;
            default:
                result = { success: false, error: `Unknown Roopik tool: ${toolName}` };
        }
        // Format and push result
        if (result.success) {
            pushToolResult(formatToolResult(toolName, result));
        }
        else {
            task.recordToolError(toolName);
            task.didToolFailInCurrentTurn = true;
            pushToolResult(formatResponse.toolError(result.error || "Tool execution failed"));
        }
    }
    catch (error) {
        await handleError(`executing ${toolName}`, error instanceof Error ? error : new Error(String(error)));
    }
}
/**
 * Handle partial (streaming) tool messages
 */
async function handleRoopikToolPartial(task, block, _callbacks) {
    const toolName = block.name;
    const params = block.params;
    // Use task.ask to show the partial message (for approval UI)
    await task.ask("tool", JSON.stringify({ tool: toolName, ...params }), block.partial).catch(() => { });
}
// ============================================================================
// Browser Tool Handlers
// ============================================================================
async function handleBrowserOpen(task, block, callbacks) {
    const url = block.params.url || block.params.args;
    return roopikClient.browserOpen(url);
}
async function handleBrowserClose(task, block, callbacks) {
    return roopikClient.browserClose();
}
async function handleBrowserActionInput(task, block, callbacks) {
    const action = block.params.action;
    if (!action) {
        return { success: false, error: "Missing required parameter: action" };
    }
    // Parse modifiers from JSON string if provided
    let modifiers;
    if (block.params.modifiers) {
        try {
            modifiers = JSON.parse(block.params.modifiers);
        }
        catch {
            modifiers = [block.params.modifiers]; // Single modifier as string
        }
    }
    return roopikClient.browserAction({
        action,
        coordinate: block.params.coordinate,
        text: block.params.text,
        key: block.params.key || block.params.args, // 'key' param or fallback to args
        modifiers,
        deltaX: block.params.deltaX ? parseFloat(block.params.deltaX) : undefined,
        deltaY: block.params.deltaY ? parseFloat(block.params.deltaY) : undefined,
    });
}
async function handleScreenshot(task, block, callbacks) {
    return roopikClient.screenshot();
}
async function handleBrowserGetPerformance(task, block, callbacks) {
    return roopikClient.browserGetPerformance();
}
async function handleBrowserGetState(task, block, callbacks) {
    return roopikClient.browserGetState();
}
async function handleBrowserSetViewport(task, block, callbacks) {
    const width = block.params.width ? parseInt(block.params.width, 10) : undefined;
    const height = block.params.height ? parseInt(block.params.height, 10) : undefined;
    const deviceScaleFactor = block.params.deviceScaleFactor ? parseFloat(block.params.deviceScaleFactor) : undefined;
    const mobile = block.params.mobile === "true";
    return roopikClient.browserSetViewport(width, height, deviceScaleFactor, mobile);
}
async function handleBrowserGetNetworkRequests(task, block, callbacks) {
    const includeStaticAssets = block.params.includeStaticAssets === "true";
    const urlFilter = block.params.urlFilter;
    const method = block.params.method;
    const statusFilter = block.params.statusFilter;
    const limit = block.params.limit ? parseInt(block.params.limit, 10) : undefined;
    return roopikClient.browserGetNetworkRequests({ includeStaticAssets, urlFilter, method, statusFilter, limit });
}
async function handleNavigate(task, block, callbacks) {
    const url = block.params.url || block.params.args;
    if (!url) {
        return { success: false, error: "Missing required parameter: url" };
    }
    return roopikClient.navigate(url);
}
async function handleReload(task, block, callbacks) {
    const ignoreCache = block.params.args?.toLowerCase() === "true" || block.params.ignoreCache?.toLowerCase() === "true";
    return roopikClient.reload(ignoreCache);
}
async function handleExecuteScript(task, block, callbacks) {
    const script = block.params.script || block.params.args || block.params.content;
    if (!script) {
        return { success: false, error: "Missing required parameter: script" };
    }
    return roopikClient.executeScript(script);
}
async function handleInspectElement(task, block, callbacks) {
    const selector = block.params.selector || block.params.args || block.params.path;
    if (!selector) {
        return { success: false, error: "Missing required parameter: selector" };
    }
    const includeInherited = block.params.includeInherited?.toLowerCase() !== "false";
    return roopikClient.inspectElement(selector, includeInherited);
}
// ============================================================================
// CDP Tool Handlers
// ============================================================================
async function handleGetErrors(task, block, callbacks) {
    const limit = block.params.limit ? parseInt(block.params.limit, 10) : undefined;
    return roopikClient.getErrors(limit);
}
async function handleGetConsoleLogs(task, block, callbacks) {
    const limit = block.params.limit ? parseInt(block.params.limit, 10) : undefined;
    const type = block.params.type;
    return roopikClient.getConsoleLogs(limit, type);
}
// ============================================================================
// Project Tool Handlers
// ============================================================================
async function handleGetActiveProject(task, block, callbacks) {
    return roopikClient.getActiveProject();
}
async function handleStartProject(task, block, callbacks) {
    const projectPath = block.params.projectPath || block.params.path || block.params.args;
    if (!projectPath) {
        return { success: false, error: "Missing required parameter: projectPath" };
    }
    const port = block.params.port ? parseInt(block.params.port, 10) : undefined;
    return roopikClient.startProject(projectPath, port);
}
async function handleStopProject(task, block, callbacks) {
    return roopikClient.stopProject();
}
// ============================================================================
// Canvas Tool Handlers
// ============================================================================
async function handleListCanvases(task, block, callbacks) {
    return roopikClient.listCanvases({
        nameFilter: block.params.nameFilter,
        sortBy: block.params.sortBy,
        sortDirection: block.params.sortDirection,
    });
}
async function handleGetActiveCanvas(task, block, callbacks) {
    return roopikClient.getActiveCanvas();
}
async function handleCreateCanvas(task, block, callbacks) {
    const name = block.params.name || block.params.args;
    if (!name) {
        return { success: false, error: "Missing required parameter: name" };
    }
    return roopikClient.createCanvas(name);
}
async function handleOpenCanvas(task, block, callbacks) {
    const canvasId = block.params.canvasId;
    const name = block.params.name;
    if (!canvasId && !name) {
        return { success: false, error: "Missing required parameter: canvasId or name" };
    }
    return roopikClient.openCanvas(canvasId, name);
}
// ============================================================================
// Component Tool Handlers
// ============================================================================
async function handleAddComponent(task, block, callbacks) {
    const folderPath = block.params.folderPath || block.params.path || block.params.args;
    if (!folderPath) {
        return { success: false, error: "Missing required parameter: folderPath" };
    }
    return roopikClient.addComponent({
        folderPath,
        canvasId: block.params.canvasId,
        name: block.params.name,
        entryFile: block.params.entryFile,
        framework: block.params.framework,
    });
}
async function handleAddComponents(task, block, callbacks) {
    const componentsJson = block.params.components || block.params.args;
    if (!componentsJson) {
        return { success: false, error: "Missing required parameter: components" };
    }
    try {
        const components = JSON.parse(componentsJson);
        if (!Array.isArray(components)) {
            return { success: false, error: "components must be an array" };
        }
        // return roopikClient.addComponents(components)
        // ------------------------------------------
        // PROCESS SEQUENTIALLY to avoid race conditions in the backend file writing
        const addedComponents = [];
        let successCount = 0;
        for (const component of components) {
            try {
                const result = await roopikClient.addComponent({
                    folderPath: component.folderPath,
                    canvasId: component.canvasId,
                    name: component.name,
                    entryFile: component.entryFile,
                    framework: component.framework,
                });
                if (result.success && result.data?.component) {
                    addedComponents.push(result.data.component);
                    successCount++;
                }
                else {
                    // Log error but continue with others?
                    // For now, let's include error info in case we want to return partial success
                    console.error(`Failed to add component ${component.name}: ${result.error}`);
                }
                // Small delay to ensure file system operations settle
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            catch (err) {
                console.error(`Exception adding component ${component.name}:`, err);
            }
        }
        return {
            success: true,
            data: {
                count: successCount,
                components: addedComponents
            }
        };
        // ------------------------------------------
    }
    catch (e) {
        return { success: false, error: `Invalid JSON in components: ${e}` };
    }
}
async function handleRemoveComponent(task, block, callbacks) {
    const componentId = block.params.componentId || block.params.args;
    if (!componentId) {
        return { success: false, error: "Missing required parameter: componentId" };
    }
    const deleteSourceCode = block.params.deleteSourceCode === "true";
    return roopikClient.removeComponent(componentId, deleteSourceCode);
}
async function handleGetComponentInfo(task, block, callbacks) {
    const componentId = block.params.componentId || block.params.args;
    if (!componentId) {
        return { success: false, error: "Missing required parameter: componentId" };
    }
    return roopikClient.getComponentInfo(componentId);
}
async function handleListComponents(task, block, callbacks) {
    const canvasId = block.params.canvasId || block.params.args;
    if (!canvasId) {
        return { success: false, error: "Missing required parameter: canvasId" };
    }
    return roopikClient.listComponents(canvasId);
}
async function handleRebuildComponent(task, block, callbacks) {
    const componentId = block.params.componentId || block.params.args;
    if (!componentId) {
        return { success: false, error: "Missing required parameter: componentId" };
    }
    return roopikClient.rebuildComponent(componentId);
}
async function handleValidateComponents(task, block, callbacks) {
    const canvasId = block.params.canvasId;
    return roopikClient.validateComponents(canvasId);
}
// ============================================================================
// Result Formatting
// ============================================================================
/**
 * Format tool result for the LLM response
 */
function formatToolResult(toolName, result) {
    const data = result.data;
    // Special handling for screenshot - include the image and viewport metadata
    if (toolName === "browser_screenshot" && data && typeof data === "object" && "image" in data) {
        const imageData = data;
        const blocks = [];
        // Add the image
        if (imageData.image) {
            // Image is a data URL, extract base64 part
            const base64Match = imageData.image.match(/^data:image\/(\w+);base64,(.+)$/);
            if (base64Match) {
                blocks.push({
                    type: "image",
                    source: {
                        type: "base64",
                        media_type: `image/${base64Match[1]}`,
                        data: base64Match[2],
                    },
                });
            }
        }
        // Add text description with viewport metadata for browser_action_input
        let description = "Screenshot captured successfully.";
        if (imageData.viewport) {
            description += ` Viewport: ${imageData.viewport.width}x${imageData.viewport.height} (devicePixelRatio: ${imageData.viewport.devicePixelRatio}). Use coordinate format 'x,y@${imageData.viewport.width}x${imageData.viewport.height}' with browser_action_input.`;
        }
        blocks.push({
            type: "text",
            text: description,
        });
        return blocks;
    }
    // For all other tools, return JSON
    return JSON.stringify(data, null, 2);
}
/**
 * Check if a tool name is a Roopik tool
 */
export { isRoopikTool };
//# sourceMappingURL=RoopikToolHandler.js.map