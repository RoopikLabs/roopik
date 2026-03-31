import * as vscode from "vscode";
import { CodeIndexManager } from "../../services/code-index/manager";
import { getWorkspacePath } from "../../utils/path";
import { formatResponse } from "../prompts/responses";
import { BaseTool } from "./BaseTool";
export class CodebaseSearchTool extends BaseTool {
    name = "codebase_search";
    async execute(params, task, callbacks) {
        const { askApproval, handleError, pushToolResult } = callbacks;
        const { query, path: directoryPrefix } = params;
        const workspacePath = task.cwd && task.cwd.trim() !== "" ? task.cwd : getWorkspacePath();
        if (!workspacePath) {
            await handleError("codebase_search", new Error("Could not determine workspace path."));
            return;
        }
        if (!query) {
            task.consecutiveMistakeCount++;
            task.didToolFailInCurrentTurn = true;
            pushToolResult(await task.sayAndCreateMissingParamError("codebase_search", "query"));
            return;
        }
        const sharedMessageProps = {
            tool: "codebaseSearch",
            query: query,
            path: directoryPrefix,
            isOutsideWorkspace: false,
        };
        const didApprove = await askApproval("tool", JSON.stringify(sharedMessageProps));
        if (!didApprove) {
            pushToolResult(formatResponse.toolDenied());
            return;
        }
        task.consecutiveMistakeCount = 0;
        try {
            const context = task.providerRef.deref()?.context;
            if (!context) {
                throw new Error("Extension context is not available.");
            }
            const manager = CodeIndexManager.getInstance(context);
            if (!manager) {
                throw new Error("CodeIndexManager is not available.");
            }
            if (!manager.isFeatureEnabled) {
                throw new Error("Code Indexing is disabled in the settings.");
            }
            if (!manager.isFeatureConfigured) {
                throw new Error("Code Indexing is not configured (Missing OpenAI Key or Qdrant URL).");
            }
            const searchResults = await manager.searchIndex(query, directoryPrefix);
            if (!searchResults || searchResults.length === 0) {
                pushToolResult(`No relevant code snippets found for the query: "${query}"`);
                return;
            }
            const jsonResult = {
                query,
                results: [],
            };
            searchResults.forEach((result) => {
                if (!result.payload)
                    return;
                if (!("filePath" in result.payload))
                    return;
                const relativePath = vscode.workspace.asRelativePath(result.payload.filePath, false);
                jsonResult.results.push({
                    filePath: relativePath,
                    score: result.score,
                    startLine: result.payload.startLine,
                    endLine: result.payload.endLine,
                    codeChunk: result.payload.codeChunk.trim(),
                });
            });
            const payload = { tool: "codebaseSearch", content: jsonResult };
            await task.say("codebase_search_result", JSON.stringify(payload));
            const output = `Query: ${query}
Results:

${jsonResult.results
                .map((result) => `File path: ${result.filePath}
Score: ${result.score}
Lines: ${result.startLine}-${result.endLine}
Code Chunk: ${result.codeChunk}
`)
                .join("\n")}`;
            pushToolResult(output);
        }
        catch (error) {
            await handleError("codebase_search", error);
        }
    }
    async handlePartial(task, block) {
        const query = block.params.query;
        const directoryPrefix = block.params.path;
        const sharedMessageProps = {
            tool: "codebaseSearch",
            query: query,
            path: directoryPrefix,
            isOutsideWorkspace: false,
        };
        await task.ask("tool", JSON.stringify(sharedMessageProps), block.partial).catch(() => { });
    }
}
export const codebaseSearchTool = new CodebaseSearchTool();
//# sourceMappingURL=CodebaseSearchTool.js.map