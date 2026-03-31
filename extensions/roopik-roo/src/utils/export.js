import * as vscode from "vscode";
import * as path from "path";
/**
 * Resolves the default save URI for an export operation.
 * Priorities:
 * 1. Last used export path (if available)
 * 2. Active workspace folder (if useWorkspace is true)
 * 3. Fallback directory (e.g. Downloads or Documents)
 * 4. Default to just the filename (user's home/cwd)
 */
export function resolveDefaultSaveUri(context, configKey, fileName, options = {}) {
    const { useWorkspace = true, fallbackDir } = options;
    const lastExportPath = context.getValue(configKey);
    if (lastExportPath) {
        // Use the directory from the last export
        const lastDir = path.dirname(lastExportPath);
        return vscode.Uri.file(path.join(lastDir, fileName));
    }
    else {
        // Try workspace if enabled
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (useWorkspace && workspaceFolders && workspaceFolders.length > 0) {
            return vscode.Uri.file(path.join(workspaceFolders[0].uri.fsPath, fileName));
        }
        // Fallback
        if (fallbackDir) {
            return vscode.Uri.file(path.join(fallbackDir, fileName));
        }
        // Default to cwd/home
        return vscode.Uri.file(fileName);
    }
}
export async function saveLastExportPath(context, configKey, uri) {
    await context.setValue(configKey, uri.fsPath);
}
//# sourceMappingURL=export.js.map