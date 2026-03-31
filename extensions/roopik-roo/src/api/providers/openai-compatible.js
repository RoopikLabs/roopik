/**
 * OpenAI-compatible provider base class using Vercel AI SDK.
 * This provides a parallel implementation to OpenAiHandler using @ai-sdk/openai-compatible.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText, generateText } from "ai";
import { convertToAiSdkMessages, convertToolsForAiSdk, processAiSdkStreamPart } from "../transform/ai-sdk";
import { DEFAULT_HEADERS } from "./constants";
import { BaseProvider } from "./base-provider";
/**
 * Base class for OpenAI-compatible API providers using Vercel AI SDK.
 * Extends BaseProvider and implements SingleCompletionHandler.
 */
export class OpenAICompatibleHandler extends BaseProvider {
    options;
    config;
    provider;
    constructor(options, config) {
        super();
        this.options = options;
        this.config = config;
        // Create the OpenAI-compatible provider using AI SDK
        this.provider = createOpenAICompatible({
            name: config.providerName,
            baseURL: config.baseURL,
            apiKey: config.apiKey,
            headers: {
                ...DEFAULT_HEADERS,
                ...(config.headers || {}),
            },
        });
    }
    /**
     * Get the language model for the configured model ID.
     */
    getLanguageModel() {
        return this.provider(this.config.modelId);
    }
    /**
     * Process usage metrics from the AI SDK response.
     * Can be overridden by subclasses to handle provider-specific usage formats.
     */
    processUsageMetrics(usage) {
        return {
            type: "usage",
            inputTokens: usage.inputTokens || 0,
            outputTokens: usage.outputTokens || 0,
            cacheReadTokens: usage.details?.cachedInputTokens,
            reasoningTokens: usage.details?.reasoningTokens,
        };
    }
    /**
     * Map OpenAI tool_choice to AI SDK toolChoice format.
     */
    mapToolChoice(toolChoice) {
        if (!toolChoice) {
            return undefined;
        }
        // Handle string values
        if (typeof toolChoice === "string") {
            switch (toolChoice) {
                case "auto":
                    return "auto";
                case "none":
                    return "none";
                case "required":
                    return "required";
                default:
                    return "auto";
            }
        }
        // Handle object values (OpenAI ChatCompletionNamedToolChoice format)
        if (typeof toolChoice === "object" && "type" in toolChoice) {
            if (toolChoice.type === "function" && "function" in toolChoice && toolChoice.function?.name) {
                return { type: "tool", toolName: toolChoice.function.name };
            }
        }
        return undefined;
    }
    /**
     * Get the max tokens parameter to include in the request.
     */
    getMaxOutputTokens() {
        const modelInfo = this.config.modelInfo;
        const maxTokens = this.config.modelMaxTokens || modelInfo.maxTokens;
        return maxTokens ?? undefined;
    }
    /**
     * Create a message stream using the AI SDK.
     */
    async *createMessage(systemPrompt, messages, metadata) {
        const model = this.getModel();
        const languageModel = this.getLanguageModel();
        // Convert messages to AI SDK format
        const aiSdkMessages = convertToAiSdkMessages(messages);
        // Convert tools to OpenAI format first, then to AI SDK format
        const openAiTools = this.convertToolsForOpenAI(metadata?.tools);
        const aiSdkTools = convertToolsForAiSdk(openAiTools);
        // Build the request options
        const requestOptions = {
            model: languageModel,
            system: systemPrompt,
            messages: aiSdkMessages,
            temperature: model.temperature ?? this.config.temperature ?? 0,
            maxOutputTokens: this.getMaxOutputTokens(),
            tools: aiSdkTools,
            toolChoice: this.mapToolChoice(metadata?.tool_choice),
        };
        // Use streamText for streaming responses
        const result = streamText(requestOptions);
        // Process the full stream to get all events
        for await (const part of result.fullStream) {
            // Use the processAiSdkStreamPart utility to convert stream parts
            for (const chunk of processAiSdkStreamPart(part)) {
                yield chunk;
            }
        }
        // Yield usage metrics at the end
        const usage = await result.usage;
        if (usage) {
            yield this.processUsageMetrics(usage);
        }
    }
    /**
     * Complete a prompt using the AI SDK generateText.
     */
    async completePrompt(prompt) {
        const languageModel = this.getLanguageModel();
        const { text } = await generateText({
            model: languageModel,
            prompt,
            maxOutputTokens: this.getMaxOutputTokens(),
            temperature: this.config.temperature ?? 0,
        });
        return text;
    }
}
//# sourceMappingURL=openai-compatible.js.map