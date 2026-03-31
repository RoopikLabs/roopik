import axios from "axios";
import { parseApiPrice } from "../../../shared/cost";
export async function getUnboundModels(apiKey) {
    const models = {};
    try {
        const headers = {};
        if (apiKey) {
            headers["Authorization"] = `Bearer ${apiKey}`;
        }
        const response = await axios.get("https://api.getunbound.ai/models", { headers });
        const rawModels = response.data?.data ?? response.data;
        for (const rawModel of rawModels) {
            const modelInfo = {
                maxTokens: rawModel.max_output_tokens ?? 8192,
                contextWindow: rawModel.context_window ?? 200_000,
                supportsPromptCache: rawModel.supports_caching ?? false,
                supportsImages: rawModel.supports_vision ?? false,
                inputPrice: parseApiPrice(rawModel.input_price),
                outputPrice: parseApiPrice(rawModel.output_price),
                description: rawModel.description,
                cacheWritesPrice: parseApiPrice(rawModel.caching_price),
                cacheReadsPrice: parseApiPrice(rawModel.cached_price),
            };
            models[rawModel.id] = modelInfo;
        }
    }
    catch (error) {
        console.error(`Error fetching Unbound models: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`);
    }
    return models;
}
//# sourceMappingURL=unbound.js.map