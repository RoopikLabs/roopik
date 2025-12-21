import { useQuery } from "@tanstack/react-query";
import { vscode } from "@src/utils/vscode";
const getLmStudioModels = async () => new Promise((resolve, reject) => {
    const cleanup = () => {
        window.removeEventListener("message", handler);
    };
    const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("LM Studio models request timed out"));
    }, 10000);
    const handler = (event) => {
        const message = event.data;
        if (message.type === "lmStudioModels") {
            clearTimeout(timeout);
            cleanup();
            if (message.lmStudioModels) {
                resolve(message.lmStudioModels);
            }
            else {
                reject(new Error("No LMStudio models in response"));
            }
        }
    };
    window.addEventListener("message", handler);
    vscode.postMessage({ type: "requestLmStudioModels" });
});
export const useLmStudioModels = (modelId) => useQuery({ queryKey: ["lmStudioModels"], queryFn: () => (modelId ? getLmStudioModels() : {}) });
//# sourceMappingURL=useLmStudioModels.js.map