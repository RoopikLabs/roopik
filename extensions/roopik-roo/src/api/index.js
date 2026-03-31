import { isRetiredProvider } from "@roo-code/types";
import { AnthropicHandler, AwsBedrockHandler, OpenRouterHandler, VertexHandler, AnthropicVertexHandler, OpenAiHandler, OpenAiCodexHandler, LmStudioHandler, GeminiHandler, OpenAiNativeHandler, DeepSeekHandler, MoonshotHandler, MistralHandler, VsCodeLmHandler, RequestyHandler, UnboundHandler, FakeAIHandler, XAIHandler, LiteLLMHandler, QwenCodeHandler, SambaNovaHandler, ZAiHandler, FireworksHandler, RooHandler, VercelAiGatewayHandler, MiniMaxHandler, BasetenHandler, } from "./providers";
import { NativeOllamaHandler } from "./providers/native-ollama";
export function buildApiHandler(configuration) {
    const { apiProvider, ...options } = configuration;
    if (apiProvider && isRetiredProvider(apiProvider)) {
        throw new Error(`Sorry, this provider is no longer supported. We saw very few Roo users actually using it and we need to reduce the surface area of our codebase so we can keep shipping fast and serving our community well in this space. It was a really hard decision but it lets us focus on what matters most to you. It sucks, we know.\n\nPlease select a different provider in your API profile settings.`);
    }
    switch (apiProvider) {
        case "anthropic":
            return new AnthropicHandler(options);
        case "openrouter":
            return new OpenRouterHandler(options);
        case "bedrock":
            return new AwsBedrockHandler(options);
        case "vertex":
            return options.apiModelId?.startsWith("claude")
                ? new AnthropicVertexHandler(options)
                : new VertexHandler(options);
        case "openai":
            return new OpenAiHandler(options);
        case "ollama":
            return new NativeOllamaHandler(options);
        case "lmstudio":
            return new LmStudioHandler(options);
        case "gemini":
            return new GeminiHandler(options);
        case "openai-codex":
            return new OpenAiCodexHandler(options);
        case "openai-native":
            return new OpenAiNativeHandler(options);
        case "deepseek":
            return new DeepSeekHandler(options);
        case "qwen-code":
            return new QwenCodeHandler(options);
        case "moonshot":
            return new MoonshotHandler(options);
        case "vscode-lm":
            return new VsCodeLmHandler(options);
        case "mistral":
            return new MistralHandler(options);
        case "requesty":
            return new RequestyHandler(options);
        case "unbound":
            return new UnboundHandler(options);
        case "fake-ai":
            return new FakeAIHandler(options);
        case "xai":
            return new XAIHandler(options);
        case "litellm":
            return new LiteLLMHandler(options);
        case "sambanova":
            return new SambaNovaHandler(options);
        case "zai":
            return new ZAiHandler(options);
        case "fireworks":
            return new FireworksHandler(options);
        case "roo":
            // Never throw exceptions from provider constructors
            // The provider-proxy server will handle authentication and return appropriate error codes
            return new RooHandler(options);
        case "vercel-ai-gateway":
            return new VercelAiGatewayHandler(options);
        case "minimax":
            return new MiniMaxHandler(options);
        case "baseten":
            return new BasetenHandler(options);
        default:
            return new AnthropicHandler(options);
    }
}
//# sourceMappingURL=index.js.map