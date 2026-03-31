import { basetenDefaultModelId, basetenModels } from "@roo-code/types";
import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider";
export class BasetenHandler extends BaseOpenAiCompatibleProvider {
    constructor(options) {
        super({
            ...options,
            providerName: "Baseten",
            baseURL: "https://inference.baseten.co/v1",
            apiKey: options.basetenApiKey,
            defaultProviderModelId: basetenDefaultModelId,
            providerModels: basetenModels,
            defaultTemperature: 0.5,
        });
    }
}
//# sourceMappingURL=baseten.js.map