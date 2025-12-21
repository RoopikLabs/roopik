import { useQuery } from "@tanstack/react-query";
import { vscode } from "@src/utils/vscode";
const getRouterModels = async (provider) => new Promise((resolve, reject) => {
    const cleanup = () => {
        window.removeEventListener("message", handler);
    };
    const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Router models request timed out"));
    }, 10000);
    const handler = (event) => {
        const message = event.data;
        if (message.type === "routerModels") {
            const msgProvider = message?.values?.provider;
            // Verify response matches request
            if (provider !== msgProvider) {
                // Not our response; ignore and wait for the matching one
                return;
            }
            clearTimeout(timeout);
            cleanup();
            if (message.routerModels) {
                resolve(message.routerModels);
            }
            else {
                reject(new Error("No router models in response"));
            }
        }
    };
    window.addEventListener("message", handler);
    if (provider) {
        vscode.postMessage({ type: "requestRouterModels", values: { provider } });
    }
    else {
        vscode.postMessage({ type: "requestRouterModels" });
    }
});
export const useRouterModels = (opts = {}) => {
    const provider = opts.provider || undefined;
    return useQuery({
        queryKey: ["routerModels", provider || "all"],
        queryFn: () => getRouterModels(provider),
        enabled: opts.enabled !== false,
    });
};
//# sourceMappingURL=useRouterModels.js.map