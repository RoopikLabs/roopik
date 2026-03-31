import { Mistral } from "@mistralai/mistralai";
import { mistralDefaultModelId, mistralModels, MISTRAL_DEFAULT_TEMPERATURE, ApiProviderError, } from "@roo-code/types";
import { TelemetryService } from "@roo-code/telemetry";
import { convertToMistralMessages } from "../transform/mistral-format";
import { BaseProvider } from "./base-provider";
export class MistralHandler extends BaseProvider {
    options;
    client;
    providerName = "Mistral";
    constructor(options) {
        super();
        if (!options.mistralApiKey) {
            throw new Error("Mistral API key is required");
        }
        // Set default model ID if not provided.
        const apiModelId = options.apiModelId || mistralDefaultModelId;
        this.options = { ...options, apiModelId };
        this.client = new Mistral({
            serverURL: apiModelId.startsWith("codestral-")
                ? this.options.mistralCodestralUrl || "https://codestral.mistral.ai"
                : "https://api.mistral.ai",
            apiKey: this.options.mistralApiKey,
        });
    }
    async *createMessage(systemPrompt, messages, metadata) {
        const { id: model, info, maxTokens, temperature } = this.getModel();
        // Build request options
        const requestOptions = {
            model,
            messages: [{ role: "system", content: systemPrompt }, ...convertToMistralMessages(messages)],
            maxTokens: maxTokens ?? info.maxTokens,
            temperature,
        };
        requestOptions.tools = this.convertToolsForMistral(metadata?.tools ?? []);
        // Always use "any" to require tool use
        requestOptions.toolChoice = "any";
        // Temporary debug log for QA
        // console.log("[MISTRAL DEBUG] Raw API request body:", requestOptions)
        let response;
        try {
            response = await this.client.chat.stream(requestOptions);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const apiError = new ApiProviderError(errorMessage, this.providerName, model, "createMessage");
            TelemetryService.instance.captureException(apiError);
            throw new Error(`Mistral completion error: ${errorMessage}`);
        }
        for await (const event of response) {
            const delta = event.data.choices[0]?.delta;
            if (delta?.content) {
                if (typeof delta.content === "string") {
                    // Handle string content as text
                    yield { type: "text", text: delta.content };
                }
                else if (Array.isArray(delta.content)) {
                    // Handle array of content chunks
                    // The SDK v1.9.18 supports ThinkChunk with type "thinking"
                    for (const chunk of delta.content) {
                        if (chunk.type === "thinking" && chunk.thinking) {
                            // Handle thinking content as reasoning chunks
                            // ThinkChunk has a 'thinking' property that contains an array of text/reference chunks
                            for (const thinkingPart of chunk.thinking) {
                                if (thinkingPart.type === "text" && thinkingPart.text) {
                                    yield { type: "reasoning", text: thinkingPart.text };
                                }
                            }
                        }
                        else if (chunk.type === "text" && chunk.text) {
                            // Handle text content normally
                            yield { type: "text", text: chunk.text };
                        }
                    }
                }
            }
            // Handle tool calls in stream
            // Mistral SDK provides tool_calls in delta similar to OpenAI format
            const toolCalls = delta?.toolCalls;
            if (toolCalls) {
                for (let i = 0; i < toolCalls.length; i++) {
                    const toolCall = toolCalls[i];
                    yield {
                        type: "tool_call_partial",
                        index: i,
                        id: toolCall.id,
                        name: toolCall.function?.name,
                        arguments: toolCall.function?.arguments,
                    };
                }
            }
            if (event.data.usage) {
                yield {
                    type: "usage",
                    inputTokens: event.data.usage.promptTokens || 0,
                    outputTokens: event.data.usage.completionTokens || 0,
                };
            }
        }
    }
    /**
     * Convert OpenAI tool definitions to Mistral format.
     * Mistral uses the same format as OpenAI for function tools.
     */
    convertToolsForMistral(tools) {
        return tools
            .filter((tool) => tool.type === "function")
            .map((tool) => ({
            type: "function",
            function: {
                name: tool.function.name,
                description: tool.function.description,
                // Mistral SDK requires parameters to be defined, use empty object as fallback
                parameters: tool.function.parameters || {},
            },
        }));
    }
    getModel() {
        const id = this.options.apiModelId ?? mistralDefaultModelId;
        const info = mistralModels[id] ?? mistralModels[mistralDefaultModelId];
        // @TODO: Move this to the `getModelParams` function.
        const maxTokens = this.options.includeMaxTokens ? info.maxTokens : undefined;
        const temperature = this.options.modelTemperature ?? MISTRAL_DEFAULT_TEMPERATURE;
        return { id, info, maxTokens, temperature };
    }
    async completePrompt(prompt) {
        const { id: model, temperature } = this.getModel();
        try {
            const response = await this.client.chat.complete({
                model,
                messages: [{ role: "user", content: prompt }],
                temperature,
            });
            const content = response.choices?.[0]?.message.content;
            if (Array.isArray(content)) {
                // Only return text content, filter out thinking content for non-streaming
                return content
                    .filter((c) => c.type === "text" && c.text)
                    .map((c) => c.text || "")
                    .join("");
            }
            return content || "";
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const apiError = new ApiProviderError(errorMessage, this.providerName, model, "completePrompt");
            TelemetryService.instance.captureException(apiError);
            throw new Error(`Mistral completion error: ${errorMessage}`);
        }
    }
}
//# sourceMappingURL=mistral.js.map