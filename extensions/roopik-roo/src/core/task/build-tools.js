import path from "path";
import { customToolRegistry, formatNative } from "@roo-code/core";
import { getRooDirectoriesForCwd } from "../../services/roo-config/index.js";
import { getNativeTools, getMcpServerTools } from "../prompts/tools/native-tools";
import { filterNativeToolsForMode, filterMcpToolsForMode, resolveToolAlias, } from "../prompts/tools/filter-tools-for-mode";
/**
 * Extracts the function name from a tool definition.
 */
function getToolName(tool) {
    return tool.function.name;
}
/**
 * Builds the complete tools array for native protocol requests.
 * Combines native tools and MCP tools, filtered by mode restrictions.
 *
 * @param options - Configuration options for building the tools
 * @returns Array of filtered native and MCP tools
 */
export async function buildNativeToolsArray(options) {
    const result = await buildNativeToolsArrayWithRestrictions(options);
    return result.tools;
}
/**
 * Builds the complete tools array for native protocol requests with optional mode restrictions.
 * When includeAllToolsWithRestrictions is true, returns ALL tools but also provides
 * the list of allowed tool names for use with allowedFunctionNames.
 *
 * This enables providers like Gemini to pass all tool definitions to the model
 * (so it can reference historical tool calls) while restricting which tools
 * can actually be invoked via allowedFunctionNames in toolConfig.
 *
 * @param options - Configuration options for building the tools
 * @returns BuildToolsResult with tools array and optional allowedFunctionNames
 */
export async function buildNativeToolsArrayWithRestrictions(options) {
    const { provider, cwd, mode, customModes, experiments, apiConfiguration, disabledTools, modelInfo, includeAllToolsWithRestrictions, } = options;
    const mcpHub = provider.getMcpHub();
    // Get CodeIndexManager for feature checking.
    const { CodeIndexManager } = await import("../../services/code-index/manager");
    const codeIndexManager = CodeIndexManager.getInstance(provider.context, cwd);
    // Build settings object for tool filtering.
    const filterSettings = {
        todoListEnabled: apiConfiguration?.todoListEnabled ?? true,
        disabledTools,
        modelInfo,
    };
    // Check if the model supports images for read_file tool description.
    const supportsImages = modelInfo?.supportsImages ?? false;
    // Build native tools with dynamic read_file tool based on settings.
    const nativeTools = getNativeTools({
        supportsImages,
    });
    // Filter native tools based on mode restrictions.
    const filteredNativeTools = filterNativeToolsForMode(nativeTools, mode, customModes, experiments, codeIndexManager, filterSettings, mcpHub);
    // Filter MCP tools based on mode restrictions.
    const mcpTools = getMcpServerTools(mcpHub);
    const filteredMcpTools = filterMcpToolsForMode(mcpTools, mode, customModes, experiments);
    // Add custom tools if they are available and the experiment is enabled.
    let nativeCustomTools = [];
    if (experiments?.customTools) {
        const toolDirs = getRooDirectoriesForCwd(cwd).map((dir) => path.join(dir, "tools"));
        await customToolRegistry.loadFromDirectoriesIfStale(toolDirs);
        const customTools = customToolRegistry.getAllSerialized();
        if (customTools.length > 0) {
            nativeCustomTools = customTools.map(formatNative);
        }
    }
    // Combine filtered tools (for backward compatibility and for allowedFunctionNames)
    const filteredTools = [...filteredNativeTools, ...filteredMcpTools, ...nativeCustomTools];
    // If includeAllToolsWithRestrictions is true, return ALL tools but provide
    // allowed names based on mode filtering
    if (includeAllToolsWithRestrictions) {
        // Combine ALL tools (unfiltered native + all MCP + custom)
        const allTools = [...nativeTools, ...mcpTools, ...nativeCustomTools];
        // Extract names of tools that are allowed based on mode filtering.
        // Resolve any alias names to canonical names to ensure consistency with allTools
        // (which uses canonical names). This prevents Gemini errors when tools are renamed
        // to aliases in filteredTools but allTools contains the original canonical names.
        const allowedFunctionNames = filteredTools.map((tool) => resolveToolAlias(getToolName(tool)));
        return {
            tools: allTools,
            allowedFunctionNames,
        };
    }
    // Default behavior: return only filtered tools
    return {
        tools: filteredTools,
    };
}
//# sourceMappingURL=build-tools.js.map