import { buildApiHandler } from "../api";
/**
 * Enhances a prompt using the configured API without creating a full Cline instance or task history.
 * This is a lightweight alternative that only uses the API's completion functionality.
 */
export async function singleCompletionHandler(apiConfiguration, promptText) {
    if (!promptText) {
        throw new Error("No prompt text provided");
    }
    if (!apiConfiguration || !apiConfiguration.apiProvider) {
        throw new Error("No valid API configuration provided");
    }
    const handler = buildApiHandler(apiConfiguration);
    // Check if handler supports single completions
    if (!("completePrompt" in handler)) {
        throw new Error("The selected API provider does not support prompt enhancement");
    }
    return handler.completePrompt(promptText);
}
//# sourceMappingURL=single-completion-handler.js.map