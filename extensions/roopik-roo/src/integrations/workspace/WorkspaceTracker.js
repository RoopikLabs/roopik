import * as vscode from "vscode";
import * as path from "path";
import { listFiles } from "../../services/glob/list-files";
import { toRelativePath, getWorkspacePath } from "../../utils/path";
const MAX_INITIAL_FILES = 1_000;
// Note: this is not a drop-in replacement for listFiles at the start of tasks, since that will be done for Desktops when there is no workspace selected
class WorkspaceTracker {
    providerRef;
    disposables = [];
    filePaths = new Set();
    updateTimer = null;
    prevWorkSpacePath;
    resetTimer = null;
    get cwd() {
        return this.providerRef?.deref()?.cwd ?? getWorkspacePath();
    }
    constructor(provider) {
        this.providerRef = new WeakRef(provider);
        this.registerListeners();
    }
    async initializeFilePaths() {
        // should not auto get filepaths for desktop since it would immediately show permission popup before cline ever creates a file
        if (!this.cwd) {
            return;
        }
        const tempCwd = this.cwd;
        const [files, _] = await listFiles(tempCwd, true, MAX_INITIAL_FILES);
        if (this.prevWorkSpacePath !== tempCwd) {
            return;
        }
        files.slice(0, MAX_INITIAL_FILES).forEach((file) => this.filePaths.add(this.normalizeFilePath(file)));
        this.workspaceDidUpdate();
    }
    registerListeners() {
        const watcher = vscode.workspace.createFileSystemWatcher("**");
        this.prevWorkSpacePath = this.cwd;
        this.disposables.push(watcher.onDidCreate(async (uri) => {
            await this.addFilePath(uri.fsPath);
            this.workspaceDidUpdate();
        }));
        // Renaming files triggers a delete and create event
        this.disposables.push(watcher.onDidDelete(async (uri) => {
            if (await this.removeFilePath(uri.fsPath)) {
                this.workspaceDidUpdate();
            }
        }));
        this.disposables.push(watcher);
        // Listen for tab changes and call workspaceDidUpdate directly
        this.disposables.push(vscode.window.tabGroups.onDidChangeTabs(() => {
            // Reset if workspace path has changed
            if (this.prevWorkSpacePath !== this.cwd) {
                this.workspaceDidReset();
            }
            else {
                // Otherwise just update
                this.workspaceDidUpdate();
            }
        }));
    }
    getOpenedTabsInfo() {
        return vscode.window.tabGroups.all.reduce((acc, group) => {
            const groupTabs = group.tabs
                .filter((tab) => tab.input instanceof vscode.TabInputText)
                .map((tab) => ({
                label: tab.label,
                isActive: tab.isActive,
                path: toRelativePath(tab.input.uri.fsPath, this.cwd || ""),
            }));
            groupTabs.forEach((tab) => (tab.isActive ? acc.unshift(tab) : acc.push(tab)));
            return acc;
        }, []);
    }
    async workspaceDidReset() {
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
        }
        this.resetTimer = setTimeout(async () => {
            if (this.prevWorkSpacePath !== this.cwd) {
                await this.providerRef.deref()?.postMessageToWebview({
                    type: "workspaceUpdated",
                    filePaths: [],
                    openedTabs: this.getOpenedTabsInfo(),
                });
                this.filePaths.clear();
                this.prevWorkSpacePath = this.cwd;
                this.initializeFilePaths();
            }
        }, 300); // Debounce for 300ms
    }
    workspaceDidUpdate() {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
        this.updateTimer = setTimeout(() => {
            if (!this.cwd) {
                return;
            }
            const relativeFilePaths = Array.from(this.filePaths).map((file) => toRelativePath(file, this.cwd));
            this.providerRef.deref()?.postMessageToWebview({
                type: "workspaceUpdated",
                filePaths: relativeFilePaths,
                openedTabs: this.getOpenedTabsInfo(),
            });
            this.updateTimer = null;
        }, 300); // Debounce for 300ms
    }
    normalizeFilePath(filePath) {
        const resolvedPath = this.cwd ? path.resolve(this.cwd, filePath) : path.resolve(filePath);
        return filePath.endsWith("/") ? resolvedPath + "/" : resolvedPath;
    }
    async addFilePath(filePath) {
        // Allow for some buffer to account for files being created/deleted during a task
        if (this.filePaths.size >= MAX_INITIAL_FILES * 2) {
            return filePath;
        }
        const normalizedPath = this.normalizeFilePath(filePath);
        try {
            const stat = await vscode.workspace.fs.stat(vscode.Uri.file(normalizedPath));
            const isDirectory = (stat.type & vscode.FileType.Directory) !== 0;
            const pathWithSlash = isDirectory && !normalizedPath.endsWith("/") ? normalizedPath + "/" : normalizedPath;
            this.filePaths.add(pathWithSlash);
            return pathWithSlash;
        }
        catch {
            // If stat fails, assume it's a file (this can happen for newly created files)
            this.filePaths.add(normalizedPath);
            return normalizedPath;
        }
    }
    async removeFilePath(filePath) {
        const normalizedPath = this.normalizeFilePath(filePath);
        return this.filePaths.delete(normalizedPath) || this.filePaths.delete(normalizedPath + "/");
    }
    dispose() {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
            this.updateTimer = null;
        }
        if (this.resetTimer) {
            clearTimeout(this.resetTimer);
            this.resetTimer = null;
        }
        this.disposables.forEach((d) => d.dispose());
        this.disposables = []; // Clear the array
    }
}
export default WorkspaceTracker;
//# sourceMappingURL=WorkspaceTracker.js.map