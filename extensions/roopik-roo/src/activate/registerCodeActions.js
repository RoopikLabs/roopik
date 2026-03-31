import * as vscode from "vscode";
import { getCodeActionCommand } from "../utils/commands";
import { EditorUtils } from "../integrations/editor/EditorUtils";
import { ClineProvider } from "../core/webview/ClineProvider";
export const registerCodeActions = (context) => {
    registerCodeAction(context, "explainCode", "EXPLAIN");
    registerCodeAction(context, "fixCode", "FIX");
    registerCodeAction(context, "improveCode", "IMPROVE");
    registerCodeAction(context, "addToContext", "ADD_TO_CONTEXT");
};
const registerCodeAction = (context, command, promptType) => {
    let userInput;
    context.subscriptions.push(vscode.commands.registerCommand(getCodeActionCommand(command), async (...args) => {
        // Handle both code action and direct command cases.
        let filePath;
        let selectedText;
        let startLine;
        let endLine;
        let diagnostics;
        if (args.length > 1) {
            // Called from code action.
            ;
            [filePath, selectedText, startLine, endLine, diagnostics] = args;
        }
        else {
            // Called directly from command palette.
            const context = EditorUtils.getEditorContext();
            if (!context) {
                return;
            }
            ;
            ({ filePath, selectedText, startLine, endLine, diagnostics } = context);
        }
        const params = {
            ...{ filePath, selectedText },
            ...(startLine !== undefined ? { startLine: startLine.toString() } : {}),
            ...(endLine !== undefined ? { endLine: endLine.toString() } : {}),
            ...(diagnostics ? { diagnostics } : {}),
            ...(userInput ? { userInput } : {}),
        };
        await ClineProvider.handleCodeAction(command, promptType, params);
    }));
};
//# sourceMappingURL=registerCodeActions.js.map