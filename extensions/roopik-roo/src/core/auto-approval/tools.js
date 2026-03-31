export function isWriteToolAction(tool) {
    return ["editedExistingFile", "appliedDiff", "newFileCreated", "generateImage"].includes(tool.tool);
}
export function isReadOnlyToolAction(tool) {
    return [
        "readFile",
        "listFiles",
        "listFilesTopLevel",
        "listFilesRecursive",
        "searchFiles",
        "codebaseSearch",
        "runSlashCommand",
    ].includes(tool.tool);
}
//# sourceMappingURL=tools.js.map