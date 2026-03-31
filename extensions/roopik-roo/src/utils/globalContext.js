import { getSettingsDirectoryPath } from "./storage";
export async function ensureSettingsDirectoryExists(context) {
    // getSettingsDirectoryPath already handles the custom storage path setting
    return await getSettingsDirectoryPath(context.globalStorageUri.fsPath);
}
//# sourceMappingURL=globalContext.js.map