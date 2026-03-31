import { internationalZAiModels, mainlandZAiModels, internationalZAiDefaultModelId, mainlandZAiDefaultModelId, ZAI_DEFAULT_TEMPERATURE, zaiApiLineConfigs, } from "@roo-code/types";
import { getModelMaxOutputTokens, shouldUseReasoningEffort } from "../../shared/api";
import { convertToZAiFormat } from "../transform/zai-format";
import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider";
export class ZAiHandler extends BaseOpenAiCompatibleProvider {
    constructor(options) {
        const isChina = zaiApiLineConfigs[options.zaiApiLine ?? "international_coding"].isChina;
        const models = (isChina ? mainlandZAiModels : internationalZAiModels);
        const defaultModelId = (isChina ? mainlandZAiDefaultModelId : internationalZAiDefaultModelId);
        super({
            ...options,
            providerName: "Z.ai",
            baseURL: zaiApiLineConfigs[options.zaiApiLine ?? "international_coding"].baseUrl,
            apiKey: options.zaiApiKey ?? "not-provided",
            defaultProviderModelId: defaultModelId,
            providerModels: models,
            defaultTemperature: ZAI_DEFAULT_TEMPERATURE,
        });
    }
    /**
     * Override createStream to handle GLM-4.7's thinking mode.
     * GLM-4.7 has thinking enabled by default in the API, so we need to
     * explicitly send { type: "disabled" } when the user turns off reasoning.
     */
    createStream(systemPrompt, messages, metadata, requestOptions) {
        const { id: modelId, info } = this.getModel();
        // Check if this is a model with thinking support (e.g. GLM-4.7, GLM-5)
        const isThinkingModel = Array.isArray(info.supportsReasoningEffort);
        if (isThinkingModel) {
            // For GLM-4.7, thinking is ON by default in the API.
            // We need to explicitly disable it when reasoning is off.
            const useReasoning = shouldUseReasoningEffort({ model: info, settings: this.options });
            // Create the stream with our custom thinking parameter
            return this.createStreamWithThinking(systemPrompt, messages, metadata, useReasoning);
        }
        // For non-thinking models, use the default behavior
        return super.createStream(systemPrompt, messages, metadata, requestOptions);
    }
    /**
     * Creates a stream with explicit thinking control for GLM-4.7
     */
    createStreamWithThinking(systemPrompt, messages, metadata, useReasoning) {
        const { id: model, info } = this.getModel();
        const max_tokens = getModelMaxOutputTokens({
            modelId: model,
            model: info,
            settings: this.options,
            format: "openai",
        }) ?? undefined;
        const temperature = this.options.modelTemperature ?? this.defaultTemperature;
        // Use Z.ai format to preserve reasoning_content and merge post-tool text into tool messages
        const convertedMessages = convertToZAiFormat(messages, { mergeToolResultText: true });
        const params = {
            model,
            max_tokens,
            temperature,
            messages: [{ role: "system", content: systemPrompt }, ...convertedMessages],
            stream: true,
            stream_options: { include_usage: true },
            // For GLM-4.7: thinking is ON by default, so we explicitly disable when needed
            thinking: useReasoning ? { type: "enabled" } : { type: "disabled" },
            tools: this.convertToolsForOpenAI(metadata?.tools),
            tool_choice: metadata?.tool_choice,
            parallel_tool_calls: metadata?.parallelToolCalls ?? true,
        };
        return this.client.chat.completions.create(params);
    }
}
//# sourceMappingURL=zai.js.map