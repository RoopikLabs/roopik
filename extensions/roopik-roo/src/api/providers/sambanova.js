import { sambaNovaDefaultModelId, sambaNovaModels } from "@roo-code/types";
import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider";
export class SambaNovaHandler extends BaseOpenAiCompatibleProvider {
    constructor(options) {
        super({
            ...options,
            providerName: "SambaNova",
            baseURL: "https://api.sambanova.ai/v1",
            apiKey: options.sambaNovaApiKey,
            defaultProviderModelId: sambaNovaDefaultModelId,
            providerModels: sambaNovaModels,
            defaultTemperature: 0.7,
        });
    }
}
//# sourceMappingURL=sambanova.js.map