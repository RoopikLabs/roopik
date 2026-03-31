import OpenAI from "openai";
import { requestyDefaultModelId, requestyDefaultModelInfo } from "@roo-code/types";
import { calculateApiCostOpenAI } from "../../shared/cost";
import { convertToOpenAiMessages } from "../transform/openai-format";
import { getModelParams } from "../transform/model-params";
import { DEFAULT_HEADERS } from "./constants";
import { getModels } from "./fetchers/modelCache";
import { BaseProvider } from "./base-provider";
import { toRequestyServiceUrl } from "../../shared/utils/requesty";
import { handleOpenAIError } from "./utils/openai-error-handler";
import { applyRouterToolPreferences } from "./utils/router-tool-preferences";
export class RequestyHandler extends BaseProvider {
    options;
    models = {};
    client;
    baseURL;
    providerName = "Requesty";
    constructor(options) {
        super();
        this.options = options;
        this.baseURL = toRequestyServiceUrl(options.requestyBaseUrl);
        const apiKey = this.options.requestyApiKey ?? "not-provided";
        this.client = new OpenAI({
            baseURL: this.baseURL,
            apiKey: apiKey,
            defaultHeaders: DEFAULT_HEADERS,
        });
    }
    async fetchModel() {
        this.models = await getModels({ provider: "requesty", baseUrl: this.baseURL });
        return this.getModel();
    }
    getModel() {
        const id = this.options.requestyModelId ?? requestyDefaultModelId;
        const cachedInfo = this.models[id] ?? requestyDefaultModelInfo;
        let info = cachedInfo;
        // Apply tool preferences for models accessed through routers (OpenAI, Gemini)
        info = applyRouterToolPreferences(id, info);
        const params = getModelParams({
            format: "anthropic",
            modelId: id,
            model: info,
            settings: this.options,
            defaultTemperature: 0,
        });
        return { id, info, ...params };
    }
    processUsageMetrics(usage, modelInfo) {
        const requestyUsage = usage;
        const inputTokens = requestyUsage?.prompt_tokens || 0;
        const outputTokens = requestyUsage?.completion_tokens || 0;
        const cacheWriteTokens = requestyUsage?.prompt_tokens_details?.caching_tokens || 0;
        const cacheReadTokens = requestyUsage?.prompt_tokens_details?.cached_tokens || 0;
        const { totalCost } = modelInfo
            ? calculateApiCostOpenAI(modelInfo, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens)
            : { totalCost: 0 };
        return {
            type: "usage",
            inputTokens: inputTokens,
            outputTokens: outputTokens,
            cacheWriteTokens: cacheWriteTokens,
            cacheReadTokens: cacheReadTokens,
            totalCost: totalCost,
        };
    }
    async *createMessage(systemPrompt, messages, metadata) {
        const { id: model, info, maxTokens: max_tokens, temperature, reasoningEffort: reasoning_effort, reasoning: thinking, } = await this.fetchModel();
        const openAiMessages = [
            { role: "system", content: systemPrompt },
            ...convertToOpenAiMessages(messages),
        ];
        // Map extended efforts to OpenAI Chat Completions-accepted values (omit unsupported)
        const allowedEffort = ["low", "medium", "high"].includes(reasoning_effort)
            ? reasoning_effort
            : undefined;
        const completionParams = {
            messages: openAiMessages,
            model,
            max_tokens,
            temperature,
            ...(allowedEffort && { reasoning_effort: allowedEffort }),
            ...(thinking && { thinking }),
            stream: true,
            stream_options: { include_usage: true },
            requesty: { trace_id: metadata?.taskId, extra: { mode: metadata?.mode } },
            tools: this.convertToolsForOpenAI(metadata?.tools),
            tool_choice: metadata?.tool_choice,
        };
        let stream;
        try {
            // With streaming params type, SDK returns an async iterable stream
            stream = await this.client.chat.completions.create(completionParams);
        }
        catch (error) {
            throw handleOpenAIError(error, this.providerName);
        }
        let lastUsage = undefined;
        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            if (delta?.content) {
                yield { type: "text", text: delta.content };
            }
            if (delta && "reasoning_content" in delta && delta.reasoning_content) {
                yield { type: "reasoning", text: delta.reasoning_content || "" };
            }
            // Handle native tool calls
            if (delta && "tool_calls" in delta && Array.isArray(delta.tool_calls)) {
                for (const toolCall of delta.tool_calls) {
                    yield {
                        type: "tool_call_partial",
                        index: toolCall.index,
                        id: toolCall.id,
                        name: toolCall.function?.name,
                        arguments: toolCall.function?.arguments,
                    };
                }
            }
            if (chunk.usage) {
                lastUsage = chunk.usage;
            }
        }
        if (lastUsage) {
            yield this.processUsageMetrics(lastUsage, info);
        }
    }
    async completePrompt(prompt) {
        const { id: model, maxTokens: max_tokens, temperature } = await this.fetchModel();
        let openAiMessages = [{ role: "system", content: prompt }];
        const completionParams = {
            model,
            max_tokens,
            messages: openAiMessages,
            temperature: temperature,
        };
        let response;
        try {
            response = await this.client.chat.completions.create(completionParams);
        }
        catch (error) {
            throw handleOpenAIError(error, this.providerName);
        }
        return response.choices[0]?.message.content || "";
    }
}
//# sourceMappingURL=requesty.js.map