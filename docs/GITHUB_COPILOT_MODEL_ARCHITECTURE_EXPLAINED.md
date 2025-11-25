# How GitHub Copilot Chat Handles Model Abstraction

**Status**: Complete Analysis
**Date**: November 24, 2025

---

## Your Questions Answered

### Q1: Where are new models updated?

**Answer**: In the **extension code**, NOT in VSCode core!

**Flow**:
```
1. Anthropic releases Claude Sonnet 4.5
2. @anthropic-ai/sdk updates (npm package)
3. Copilot Extension updates to use new SDK
4. Extension's provideLanguageModelChatInfo() returns new model
5. VSCode Chat automatically sees new model (no code change!)
```

**Example**:
```bash
# Extension updates its package.json
npm update @anthropic-ai/sdk  # ← Gets Claude Sonnet 4.5 support

# Extension code automatically returns new model
async provideLanguageModelChatInfo() {
    return [{
        identifier: 'anthropic:claude-sonnet-4-5',  // ← NEW!
        metadata: {
            name: 'Claude Sonnet 4.5',
            model: 'claude-sonnet-4-5-20250929'
        }
    }];
}

# VSCode core? No changes needed!
```

---

### Q2: Is GitHub Copilot doing model abstraction in their backend or in VSCode code?

**Answer**: **BOTH!** But in different ways:

#### Part 1: Extension API (In VSCode Code)

**Location**: `src/vs/workbench/api/common/extHostLanguageModels.ts`

VSCode provides an **Extension API** that allows extensions to register language model providers:

```typescript
// Extension API (exposed to extensions via vscode.d.ts)
export interface LanguageModelChatProvider {
    provideLanguageModelChatResponse(
        messages: vscode.LanguageModelChatMessage[],
        options: vscode.LanguageModelChatRequestOptions,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.LanguageModelChatResponse>;
}

// Extensions call this:
vscode.lm.registerChatModelProvider(vendor, provider);
```

#### Part 2: Provider Registry (In VSCode Code)

**Location**: `src/vs/workbench/contrib/chat/common/languageModels.ts`

VSCode maintains a **provider registry**:

```typescript
export class LanguageModelsService implements ILanguageModelsService {
    private readonly _providers = new Map<string, ILanguageModelChatProvider>();

    registerLanguageModelProvider(vendor: string, provider: ILanguageModelChatProvider): IDisposable {
        this._providers.set(vendor, provider);

        // Listen for provider changes
        provider.onDidChange(async () => {
            await this._resolveLanguageModels(vendor, true);
        });
    }

    async sendChatRequest(modelId: string, from: ExtensionIdentifier, messages, options, token) {
        const provider = this._providers.get(this._modelCache.get(modelId)?.vendor);
        return provider.sendChatRequest(modelId, messages, from, options, token);
    }
}
```

#### Part 3: Actual Model Inference (In Extension OR Backend)

There are **two types of extensions**:

**Type A: Extension with Backend** (GitHub Copilot's approach)
```typescript
// GitHub Copilot Extension
class CopilotProvider implements vscode.LanguageModelChatProvider {
    async provideLanguageModelChatResponse(messages, options, token) {
        // Extension calls GitHub's backend API
        const response = await fetch('https://api.githubcopilot.com/chat', {
            method: 'POST',
            body: JSON.stringify({ messages, model: options.model })
        });

        return {
            stream: convertToStream(response)
        };
    }
}
```

**Type B: Extension with Direct API** (What you'll do)
```typescript
// Anthropic Extension (hypothetical)
class AnthropicProvider implements vscode.LanguageModelChatProvider {
    private client: Anthropic;

    constructor() {
        this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }

    async provideLanguageModelChatResponse(messages, options, token) {
        // Extension calls Anthropic directly (no backend needed!)
        const stream = await this.client.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            messages: convertMessages(messages),
            stream: true
        });

        return {
            stream: convertToVSCodeStream(stream)
        };
    }
}
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    VSCode Chat UI                            │
│  (Your code: RoopikAgent Chat Widget)                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ uses
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              ILanguageModelsService                          │
│  (VSCode Core: src/vs/workbench/contrib/chat/common/)       │
│                                                              │
│  - registerLanguageModelProvider(vendor, provider)          │
│  - sendChatRequest(modelId, messages, ...)                  │
│  - Provider Registry: Map<vendor, provider>                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ delegates to
                         ▼
┌─────────────────────────────────────────────────────────────┐
│            Extension Providers (Separate packages)           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────┐     ┌─────────────────────┐        │
│  │ GitHub Copilot Ext │     │  Anthropic Ext      │        │
│  │ (closed source)    │     │  (you build this)   │        │
│  └─────────┬──────────┘     └──────────┬──────────┘        │
│            │                            │                    │
│            │                            │                    │
│  ┌─────────▼──────────┐     ┌──────────▼──────────┐        │
│  │ GitHub Backend API │     │ @anthropic-ai/sdk   │        │
│  │ (their servers)    │     │ (direct API calls)  │        │
│  └────────────────────┘     └─────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

---

## What YOU Need to Build for RoopikAgent

You **DON'T need a backend server**! You can call model APIs directly from VSCode.

### Option 1: Copy VSCode Chat's Pattern (Recommended)

**Files to copy/modify**:

```
src/vs/workbench/contrib/roopikAgent/
├── common/
│   ├── llm/
│   │   ├── modelService.ts          ← Copy from languageModels.ts
│   │   ├── providers/
│   │   │   ├── anthropicProvider.ts  ← New (uses @anthropic-ai/sdk)
│   │   │   ├── openaiProvider.ts     ← New (uses openai SDK)
│   │   │   └── googleProvider.ts     ← New (uses @google/generative-ai)
│   │   └── types.ts                 ← Provider interfaces
```

**Step 1: Define Provider Interface** (copy pattern from VSCode)

```typescript
// src/vs/workbench/contrib/roopikAgent/common/llm/types.ts

import { Event } from '../../../../../base/common/event.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';

export interface ILLMProvider {
    readonly vendor: string;
    readonly onDidChange: Event<void>;

    provideModelInfo(): Promise<IModelMetadata[]>;

    sendChatRequest(
        modelId: string,
        messages: IChatMessage[],
        options: IChatOptions,
        token: CancellationToken
    ): Promise<ILLMResponse>;
}

export interface IModelMetadata {
    id: string;
    name: string;
    maxInputTokens: number;
    maxOutputTokens: number;
    capabilities: {
        vision?: boolean;
        toolCalling?: boolean;
        extendedThinking?: boolean;
    };
}

export interface ILLMResponse {
    stream: AsyncIterable<IResponsePart>;
}

export type IResponsePart =
    | { type: 'text'; value: string }
    | { type: 'tool_call'; id: string; name: string; parameters: any }
    | { type: 'thinking'; value: string };
```

**Step 2: Implement Anthropic Provider** (uses official SDK)

```typescript
// src/vs/workbench/contrib/roopikAgent/common/llm/providers/anthropicProvider.ts

import Anthropic from '@anthropic-ai/sdk';
import { Emitter } from '../../../../../../base/common/event.js';
import type { ILLMProvider, IModelMetadata, ILLMResponse } from '../types.js';

export class AnthropicProvider implements ILLMProvider {
    readonly vendor = 'anthropic';

    private readonly _onDidChange = new Emitter<void>();
    readonly onDidChange = this._onDidChange.event;

    private client: Anthropic;

    constructor(apiKey: string) {
        this.client = new Anthropic({ apiKey });
    }

    async provideModelInfo(): Promise<IModelMetadata[]> {
        // Returns available models
        return [
            {
                id: 'claude-sonnet-4-5-20250929',
                name: 'Claude Sonnet 4.5',
                maxInputTokens: 200000,
                maxOutputTokens: 8192,
                capabilities: {
                    vision: true,
                    toolCalling: true,
                    extendedThinking: true
                }
            },
            {
                id: 'claude-opus-4-20250514',
                name: 'Claude Opus 4',
                maxInputTokens: 200000,
                maxOutputTokens: 8192,
                capabilities: {
                    vision: true,
                    toolCalling: true,
                    extendedThinking: true
                }
            }
        ];
    }

    async sendChatRequest(modelId, messages, options, token): Promise<ILLMResponse> {
        const stream = await this.client.messages.create({
            model: modelId,
            messages: this.convertMessages(messages),
            stream: true,
            tools: this.convertTools(options.tools),
            max_tokens: options.maxTokens ?? 8192
        });

        return {
            stream: this.convertStream(stream)
        };
    }

    private async *convertStream(stream: AsyncIterable<Anthropic.MessageStreamEvent>) {
        for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                yield { type: 'text', value: chunk.delta.text };
            }

            if (chunk.type === 'content_block_start' && chunk.content_block.type === 'tool_use') {
                yield {
                    type: 'tool_call',
                    id: chunk.content_block.id,
                    name: chunk.content_block.name,
                    parameters: chunk.content_block.input
                };
            }

            if (chunk.type === 'content_block_start' && chunk.content_block.type === 'thinking') {
                yield {
                    type: 'thinking',
                    value: chunk.content_block.thinking || ''
                };
            }
        }
    }
}
```

**Step 3: Model Service** (manages providers)

```typescript
// src/vs/workbench/contrib/roopikAgent/common/llm/modelService.ts

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import type { ILLMProvider, IModelMetadata } from './types.js';

export const ILLMService = createDecorator<ILLMService>('llmService');

export interface ILLMService {
    readonly _serviceBrand: undefined;

    registerProvider(provider: ILLMProvider): void;
    getProvider(vendor: string): ILLMProvider | undefined;
    getAvailableModels(): Promise<IModelMetadata[]>;
    sendRequest(modelId: string, messages, options, token): Promise<ILLMResponse>;
}

export class LLMService extends Disposable implements ILLMService {
    declare readonly _serviceBrand: undefined;

    private providers = new Map<string, ILLMProvider>();

    registerProvider(provider: ILLMProvider): void {
        this.providers.set(provider.vendor, provider);
    }

    getProvider(vendor: string): ILLMProvider | undefined {
        return this.providers.get(vendor);
    }

    async getAvailableModels(): Promise<IModelMetadata[]> {
        const allModels: IModelMetadata[] = [];

        for (const provider of this.providers.values()) {
            const models = await provider.provideModelInfo();
            allModels.push(...models);
        }

        return allModels;
    }

    async sendRequest(modelId, messages, options, token) {
        // Find which provider has this model
        for (const provider of this.providers.values()) {
            const models = await provider.provideModelInfo();
            if (models.some(m => m.id === modelId)) {
                return provider.sendChatRequest(modelId, messages, options, token);
            }
        }

        throw new Error(`No provider found for model: ${modelId}`);
    }
}
```

**Step 4: Initialize Providers** (in your main contribution file)

```typescript
// src/vs/workbench/contrib/roopikAgent/browser/roopik.contribution.ts

import { AnthropicProvider } from '../common/llm/providers/anthropicProvider.js';
import { OpenAIProvider } from '../common/llm/providers/openaiProvider.js';
import { ILLMService } from '../common/llm/modelService.js';

// Register providers on startup
const llmService = accessor.get(ILLMService);

// Register Anthropic
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
if (anthropicApiKey) {
    llmService.registerProvider(new AnthropicProvider(anthropicApiKey));
}

// Register OpenAI
const openaiApiKey = process.env.OPENAI_API_KEY;
if (openaiApiKey) {
    llmService.registerProvider(new OpenAIProvider(openaiApiKey));
}
```

---

## Why This Works Without a Backend

**You can call model APIs directly** because:

1. ✅ **VSCode extensions run in Node.js** (not browser)
2. ✅ **You have access to environment variables** (for API keys)
3. ✅ **Official SDKs handle everything** (retries, streaming, errors)
4. ✅ **No CORS issues** (you're in Node.js, not browser)

**GitHub Copilot uses a backend because**:
- They want centralized billing
- They want rate limiting across all users
- They want to log usage for analytics
- They integrate with GitHub's infrastructure

**You don't need that yet!** Start simple with direct API calls.

---

## Continue.dev Reference (Optional)

If you want to see Continue.dev's code as reference:

```bash
git clone https://github.com/continuedev/continue.git
cd continue
```

**Key files**:
- `core/llm/llms/Anthropic.ts` - How they implement Anthropic
- `core/llm/llms/OpenAI.ts` - How they implement OpenAI
- `core/llm/index.ts` - Their ILLM interface

**But honestly**: VSCode Chat's code is better for you since it already uses VSCode patterns!

---

## Summary

**Answer to your questions**:

1. ✅ **New models updated**: In extension code (via SDK updates), NOT in core
2. ✅ **GitHub Copilot architecture**: Both in VSCode (registry) AND backend (actual inference)
3. ✅ **What you should do**: Copy VSCode's registry pattern, call APIs directly (no backend needed yet)
4. ✅ **Continue.dev**: Good reference but VSCode Chat is better for you
5. ✅ **Adapter pattern**: Yes, that's what I suggested - normalize at provider boundary

**Next steps**:
1. Copy provider interface pattern from VSCode Chat
2. Implement AnthropicProvider using `@anthropic-ai/sdk`
3. Create LLMService with provider registry
4. No backend needed - call APIs directly!
5. Later, if you need: Add backend for billing/rate limiting

**You're ready to start implementation!** 🚀
