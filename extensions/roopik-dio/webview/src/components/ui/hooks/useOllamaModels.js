import { useQuery } from "@tanstack/react-query";
import { vscode } from "@src/utils/vscode";
const getOllamaModels = async () => new Promise((resolve, reject) => {
    const cleanup = () => {
        window.removeEventListener("message", handler);
    };
    const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Ollama models request timed out"));
    }, 10000);
    const handler = (event) => {
        const message = event.data;
        if (message.type === "ollamaModels") {
            clearTimeout(timeout);
            cleanup();
            if (message.ollamaModels) {
                resolve(message.ollamaModels);
            }
            else {
                reject(new Error("No Ollama models in response"));
            }
        }
    };
    window.addEventListener("message", handler);
    vscode.postMessage({ type: "requestOllamaModels" });
});
export const useOllamaModels = (modelId) => useQuery({ queryKey: ["ollamaModels"], queryFn: () => (modelId ? getOllamaModels() : {}) });
//# sourceMappingURL=useOllamaModels.js.map