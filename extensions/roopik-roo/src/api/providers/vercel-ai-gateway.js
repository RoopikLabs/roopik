import { vercelAiGatewayDefaultModelId, vercelAiGatewayDefaultModelInfo, VERCEL_AI_GATEWAY_DEFAULT_TEMPERATURE, VERCEL_AI_GATEWAY_PROMPT_CACHING_MODELS, } from "@roo-code/types";
import { convertToOpenAiMessages } from "../transform/openai-format";
import { addCacheBreakpoints } from "../transform/caching/vercel-ai-gateway";
import { RouterProvider } from "./router-provider";
export class VercelAiGatewayHandler extends RouterProvider {
    constructor(options) {
        super({
            options,
            name: "vercel-ai-gateway",
            baseURL: "https://ai-gateway.vercel.sh/v1",
            apiKey: options.vercelAiGatewayApiKey,
            modelId: options.vercelAiGatewayModelId,
            defaultModelId: vercelAiGatewayDefaultModelId,
            defaultModelInfo: vercelAiGatewayDefaultModelInfo,
        });
    }
    async *createMessage(systemPrompt, messages, metadata) {
        const { id: modelId, info } = await this.fetchModel();
        const openAiMessages = [
            { role: "system", content: systemPrompt },
            ...convertToOpenAiMessages(messages),
        ];
        if (VERCEL_AI_GATEWAY_PROMPT_CACHING_MODELS.has(modelId) && info.supportsPromptCache) {
            addCacheBreakpoints(systemPrompt, openAiMessages);
        }
        const body = {
            model: modelId,
            messages: openAiMessages,
            temperature: this.supportsTemperature(modelId)
                ? (this.options.modelTemperature ?? VERCEL_AI_GATEWAY_DEFAULT_TEMPERATURE)
                : undefined,
            max_completion_tokens: info.maxTokens,
            stream: true,
            stream_options: { include_usage: true },
            tools: this.convertToolsForOpenAI(metadata?.tools),
            tool_choice: metadata?.tool_choice,
            parallel_tool_calls: metadata?.parallelToolCalls ?? true,
        };
        const completion = await this.client.chat.completions.create(body);
        for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta;
            if (delta?.content) {
                yield {
                    type: "text",
                    text: delta.content,
                };
            }
            // Emit raw tool call chunks - NativeToolCallParser handles state management
            if (delta?.tool_calls) {
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
                const usage = chunk.usage;
                yield {
                    type: "usage",
                    inputTokens: usage.prompt_tokens || 0,
                    outputTokens: usage.completion_tokens || 0,
                    cacheWriteTokens: usage.cache_creation_input_tokens || undefined,
                    cacheReadTokens: usage.prompt_tokens_details?.cached_tokens || undefined,
                    totalCost: usage.cost ?? 0,
                };
            }
        }
    }
    async completePrompt(prompt) {
        const { id: modelId, info } = await this.fetchModel();
        try {
            const requestOptions = {
                model: modelId,
                messages: [{ role: "user", content: prompt }],
                stream: false,
            };
            if (this.supportsTemperature(modelId)) {
                requestOptions.temperature = this.options.modelTemperature ?? VERCEL_AI_GATEWAY_DEFAULT_TEMPERATURE;
            }
            requestOptions.max_completion_tokens = info.maxTokens;
            const response = await this.client.chat.completions.create(requestOptions);
            return response.choices[0]?.message.content || "";
        }
        catch (error) {
            if (error instanceof Error) {
                throw new Error(`Vercel AI Gateway completion error: ${error.message}`);
            }
            throw error;
        }
    }
}
//# sourceMappingURL=vercel-ai-gateway.js.map