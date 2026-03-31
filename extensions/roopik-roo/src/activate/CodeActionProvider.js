import * as vscode from "vscode";
import { Package } from "../shared/package";
import { getCodeActionCommand } from "../utils/commands";
import { EditorUtils } from "../integrations/editor/EditorUtils";
export const TITLES = {
    EXPLAIN: "Explain with Dio",
    FIX: "Fix with Dio",
    IMPROVE: "Improve with Dio",
    ADD_TO_CONTEXT: "Add to Dio",
    NEW_TASK: "New Dio Task",
};
export class CodeActionProvider {
    static providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix,
        vscode.CodeActionKind.RefactorRewrite,
    ];
    createAction(title, kind, command, args) {
        const action = new vscode.CodeAction(title, kind);
        action.command = { command: getCodeActionCommand(command), title, arguments: args };
        return action;
    }
    provideCodeActions(document, range, context) {
        try {
            if (!vscode.workspace.getConfiguration(Package.name).get("enableCodeActions", true)) {
                return [];
            }
            const effectiveRange = EditorUtils.getEffectiveRange(document, range);
            if (!effectiveRange) {
                return [];
            }
            const filePath = EditorUtils.getFilePath(document);
            const actions = [];
            actions.push(this.createAction(TITLES.ADD_TO_CONTEXT, vscode.CodeActionKind.QuickFix, "addToContext", [
                filePath,
                effectiveRange.text,
                effectiveRange.range.start.line + 1,
                effectiveRange.range.end.line + 1,
            ]));
            if (context.diagnostics.length > 0) {
                const relevantDiagnostics = context.diagnostics.filter((d) => EditorUtils.hasIntersectingRange(effectiveRange.range, d.range));
                if (relevantDiagnostics.length > 0) {
                    actions.push(this.createAction(TITLES.FIX, vscode.CodeActionKind.QuickFix, "fixCode", [
                        filePath,
                        effectiveRange.text,
                        effectiveRange.range.start.line + 1,
                        effectiveRange.range.end.line + 1,
                        relevantDiagnostics.map(EditorUtils.createDiagnosticData),
                    ]));
                }
            }
            else {
                actions.push(this.createAction(TITLES.EXPLAIN, vscode.CodeActionKind.QuickFix, "explainCode", [
                    filePath,
                    effectiveRange.text,
                    effectiveRange.range.start.line + 1,
                    effectiveRange.range.end.line + 1,
                ]));
                actions.push(this.createAction(TITLES.IMPROVE, vscode.CodeActionKind.QuickFix, "improveCode", [
                    filePath,
                    effectiveRange.text,
                    effectiveRange.range.start.line + 1,
                    effectiveRange.range.end.line + 1,
                ]));
            }
            return actions;
        }
        catch (error) {
            console.error("Error providing code actions:", error);
            return [];
        }
    }
}
//# sourceMappingURL=CodeActionProvider.js.map