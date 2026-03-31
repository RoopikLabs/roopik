import * as path from "path";
import { formatResponse } from "../prompts/responses";
import { listFiles } from "../../services/glob/list-files";
import { getReadablePath } from "../../utils/path";
import { isPathOutsideWorkspace } from "../../utils/pathUtils";
import { BaseTool } from "./BaseTool";
export class ListFilesTool extends BaseTool {
    name = "list_files";
    async execute(params, task, callbacks) {
        const { path: relDirPath, recursive } = params;
        const { askApproval, handleError, pushToolResult } = callbacks;
        try {
            if (!relDirPath) {
                task.consecutiveMistakeCount++;
                task.recordToolError("list_files");
                task.didToolFailInCurrentTurn = true;
                pushToolResult(await task.sayAndCreateMissingParamError("list_files", "path"));
                return;
            }
            task.consecutiveMistakeCount = 0;
            const absolutePath = path.resolve(task.cwd, relDirPath);
            const isOutsideWorkspace = isPathOutsideWorkspace(absolutePath);
            const [files, didHitLimit] = await listFiles(absolutePath, recursive || false, 200);
            const { showRooIgnoredFiles = false } = (await task.providerRef.deref()?.getState()) ?? {};
            const result = formatResponse.formatFilesList(absolutePath, files, didHitLimit, task.rooIgnoreController, showRooIgnoredFiles, task.rooProtectedController);
            const sharedMessageProps = {
                tool: !recursive ? "listFilesTopLevel" : "listFilesRecursive",
                path: getReadablePath(task.cwd, relDirPath),
                isOutsideWorkspace,
            };
            const completeMessage = JSON.stringify({ ...sharedMessageProps, content: result });
            const didApprove = await askApproval("tool", completeMessage);
            if (!didApprove) {
                return;
            }
            pushToolResult(result);
        }
        catch (error) {
            await handleError("listing files", error);
        }
    }
    async handlePartial(task, block) {
        const relDirPath = block.params.path;
        const recursiveRaw = block.params.recursive;
        const recursive = recursiveRaw?.toLowerCase() === "true";
        const absolutePath = relDirPath ? path.resolve(task.cwd, relDirPath) : task.cwd;
        const isOutsideWorkspace = isPathOutsideWorkspace(absolutePath);
        const sharedMessageProps = {
            tool: !recursive ? "listFilesTopLevel" : "listFilesRecursive",
            path: getReadablePath(task.cwd, relDirPath ?? ""),
            isOutsideWorkspace,
        };
        const partialMessage = JSON.stringify({ ...sharedMessageProps, content: "" });
        await task.ask("tool", partialMessage, block.partial).catch(() => { });
    }
}
export const listFilesTool = new ListFilesTool();
//# sourceMappingURL=ListFilesTool.js.map