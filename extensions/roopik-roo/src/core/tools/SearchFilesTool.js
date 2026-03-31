import path from "path";
import { getReadablePath } from "../../utils/path";
import { isPathOutsideWorkspace } from "../../utils/pathUtils";
import { regexSearchFiles } from "../../services/ripgrep";
import { BaseTool } from "./BaseTool";
export class SearchFilesTool extends BaseTool {
    name = "search_files";
    async execute(params, task, callbacks) {
        const { askApproval, handleError, pushToolResult } = callbacks;
        const relDirPath = params.path;
        const regex = params.regex;
        const filePattern = params.file_pattern || undefined;
        if (!relDirPath) {
            task.consecutiveMistakeCount++;
            task.recordToolError("search_files");
            task.didToolFailInCurrentTurn = true;
            pushToolResult(await task.sayAndCreateMissingParamError("search_files", "path"));
            return;
        }
        if (!regex) {
            task.consecutiveMistakeCount++;
            task.recordToolError("search_files");
            task.didToolFailInCurrentTurn = true;
            pushToolResult(await task.sayAndCreateMissingParamError("search_files", "regex"));
            return;
        }
        task.consecutiveMistakeCount = 0;
        const absolutePath = path.resolve(task.cwd, relDirPath);
        const isOutsideWorkspace = isPathOutsideWorkspace(absolutePath);
        const sharedMessageProps = {
            tool: "searchFiles",
            path: getReadablePath(task.cwd, relDirPath),
            regex: regex,
            filePattern: filePattern,
            isOutsideWorkspace,
        };
        try {
            const results = await regexSearchFiles(task.cwd, absolutePath, regex, filePattern, task.rooIgnoreController);
            const completeMessage = JSON.stringify({ ...sharedMessageProps, content: results });
            const didApprove = await askApproval("tool", completeMessage);
            if (!didApprove) {
                return;
            }
            pushToolResult(results);
        }
        catch (error) {
            await handleError("searching files", error);
        }
    }
    async handlePartial(task, block) {
        const relDirPath = block.params.path;
        const regex = block.params.regex;
        const filePattern = block.params.file_pattern;
        const absolutePath = relDirPath ? path.resolve(task.cwd, relDirPath) : task.cwd;
        const isOutsideWorkspace = isPathOutsideWorkspace(absolutePath);
        const sharedMessageProps = {
            tool: "searchFiles",
            path: getReadablePath(task.cwd, relDirPath ?? ""),
            regex: regex ?? "",
            filePattern: filePattern ?? "",
            isOutsideWorkspace,
        };
        const partialMessage = JSON.stringify({ ...sharedMessageProps, content: "" });
        await task.ask("tool", partialMessage, block.partial).catch(() => { });
    }
}
export const searchFilesTool = new SearchFilesTool();
//# sourceMappingURL=SearchFilesTool.js.map