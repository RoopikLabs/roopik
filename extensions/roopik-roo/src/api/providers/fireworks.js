import { fireworksDefaultModelId, fireworksModels } from "@roo-code/types";
import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider";
export class FireworksHandler extends BaseOpenAiCompatibleProvider {
    constructor(options) {
        super({
            ...options,
            providerName: "Fireworks",
            baseURL: "https://api.fireworks.ai/inference/v1",
            apiKey: options.fireworksApiKey,
            defaultProviderModelId: fireworksDefaultModelId,
            providerModels: fireworksModels,
            defaultTemperature: 0.5,
        });
    }
}
//# sourceMappingURL=fireworks.js.map