# Image Handling Architecture: From Tools to LLM APIs

## The Question

> **"When AI agent uses Roopik native tools or MCP tools that return base64 image data, how does the LLM 'see' the image? The tool returns raw JSON with base64 data like `"image": "data:image/png;base64,ABC123..."`, but how does this get properly formatted and sent to different LLM provider APIs (Anthropic, Gemini, OpenAI, etc.)? And why is the code using Anthropic types when I'm using Gemini?"**

## The Answer

### Short Answer
**Anthropic's message format is used as the internal "lingua franca" (common language) throughout roopik-dio.** All tools return responses in Anthropic format, which is then automatically converted to each provider's specific API format (Gemini, OpenAI, Mistral, etc.) before making the API call.

### Why Anthropic Format?
It's **NOT** because of favoritism toward Anthropic! The reasons are:

1. **Clean, Well-Structured Format** - Anthropic's message format is comprehensive and well-documented
2. **Internal Standard** - Easier to have ONE format internally, then transform at the edges
3. **Comprehensive Support** - Handles text, images, tool calls, tool results elegantly
4. **Easy to Transform** - Can be converted to any provider's format

Think of it like using JSON as a data exchange format - it's a standard that everyone transforms to/from.

## Architecture Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          ROOPIK-DIO ARCHITECTURE                         │
└─────────────────────────────────────────────────────────────────────────┘

1. TOOL EXECUTION
   ┌──────────────────────────────────────────────────────┐
   │  Tool (browser_screenshot, read_file, MCP resource)  │
   │  Returns: { image: "data:image/png;base64,ABC123" }  │
   └────────────────────┬─────────────────────────────────┘
                        │
                        ▼
2. TOOL RESULT FORMATTING (Anthropic Format)
   ┌─────────────────────────────────────────────────────────────────┐
   │  RoopikToolHandler.formatToolResult()                           │
   │  Location: roopik-dio/src/core/tools/roopik/RoopikToolHandler.ts│
   │  Lines: 445-479                                                  │
   │                                                                  │
   │  Returns: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>│
   │  {                                                               │
   │    type: "image",                                                │
   │    source: {                                                     │
   │      type: "base64",                                             │
   │      media_type: "image/png",                                    │
   │      data: "ABC123..."                                           │
   │    }                                                             │
   │  }                                                               │
   └────────────────────┬────────────────────────────────────────────┘
                        │
                        ▼
3. STORED IN MESSAGE HISTORY (Anthropic Format)
   ┌──────────────────────────────────────────────────────┐
   │  All messages stored internally in Anthropic format  │
   │  Type: Anthropic.Messages.MessageParam               │
   └────────────────────┬─────────────────────────────────┘
                        │
                        ▼
4. PROVIDER-SPECIFIC TRANSFORMATION
   ┌─────────────────────────────────────────────────────────────────┐
   │                  BEFORE SENDING TO LLM API                       │
   │  Location: roopik-dio/src/api/providers/[provider].ts           │
   └─────────────────────────────────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┬──────────────────┐
        ▼               ▼               ▼                  ▼
   ┌─────────┐    ┌──────────┐    ┌─────────┐       ┌──────────┐
   │Anthropic│    │  Gemini  │    │ OpenAI  │       │ Mistral  │
   │  (no    │    │(convert) │    │(convert)│       │(convert) │
   │convert) │    │          │    │         │       │          │
   └─────────┘    └──────────┘    └─────────┘       └──────────┘
        │              │               │                  │
        ▼              ▼               ▼                  ▼
   Native Format  Gemini Format  OpenAI Format   Mistral Format
```

## Code Reference: Complete Flow

### Step 1: Tool Returns Base64 Image Data

**File:** `extensions/roopik-dio/src/services/roopik.ts` (RoopikToolClient)
```typescript
async screenshot(): Promise<RoopikToolResult> {
  const response = await vscode.commands.executeCommand('roopik.browser.screenshot');
  // Returns: { success: true, image: "data:image/png;base64,ABC123...", format: "data-url" }
}
```

### Step 2: Tool Result Formatting (Converts to Anthropic Format)

**File:** `extensions/roopik-dio/src/core/tools/roopik/RoopikToolHandler.ts`
**Method:** `formatToolResult()`
**Lines:** 445-479

```typescript
function formatToolResult(toolName: RoopikToolName, result: RoopikToolResult): ToolResponse {
  const data = result.data

  // Special handling for screenshot - include the image
  if (toolName === "browser_screenshot" && data && typeof data === "object" && "image" in data) {
    const imageData = data as { image: string; format: string }
    const blocks: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = []

    // Add the image
    if (imageData.image) {
      // Image is a data URL, extract base64 part
      const base64Match = imageData.image.match(/^data:image\/(\w+);base64,(.+)$/)
      if (base64Match) {
        blocks.push({
          type: "image",                                    // ← Anthropic format
          source: {
            type: "base64",                                 // ← Anthropic format
            media_type: `image/${base64Match[1]}`,          // ← Anthropic format
            data: base64Match[2],                           // ← Pure base64 data
          },
        })
      }
    }

    // Add text description
    blocks.push({
      type: "text",
      text: "Screenshot captured successfully. The image shows the current state of the browser preview.",
    })

    return blocks  // ← Returns Anthropic format blocks
  }

  // For all other tools, return JSON
  return JSON.stringify(data, null, 2)
}
```

**Type Definition:**
```typescript
// File: extensions/roopik-dio/src/shared/tools.ts
export type ToolResponse = string | Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam>
```

### Step 3: Message Storage (All in Anthropic Format)

**File:** `extensions/roopik-dio/src/core/task/Task.ts`
- All conversation messages stored as `Anthropic.Messages.MessageParam[]`
- Tool results with images stored in Anthropic format
- This is the "source of truth" for conversation history

### Step 4: Provider-Specific Conversion

#### For Gemini

**File:** `extensions/roopik-dio/src/api/providers/gemini.ts`
**Method:** Converts messages before API call
**Lines:** 128

```typescript
const contents = geminiMessages
  .map((message) => convertAnthropicMessageToGemini(message, { includeThoughtSignatures, toolIdToName }))
  .flat()

// Then sends to Gemini API with converted format
```

**File:** `extensions/roopik-dio/src/api/transform/gemini-format.ts`
**Method:** `convertAnthropicContentToGemini()`
**Lines:** 68-76

```typescript
export function convertAnthropicContentToGemini(content, options): Part[] {
  // ...
  const parts = content.flatMap((block): Part | Part[] => {
    switch (block.type) {
      case "image":
        if (block.source.type !== "base64") {
          throw new Error("Unsupported image source type")
        }

        // ← Converts Anthropic format to Gemini format
        return {
          inlineData: {
            data: block.source.data,              // ← base64 data
            mimeType: block.source.media_type      // ← "image/png"
          }
        }
      // ... other cases
    }
  })
}
```

**Conversion Example:**
```typescript
// Anthropic Format (Internal)
{
  type: "image",
  source: {
    type: "base64",
    media_type: "image/png",
    data: "ABC123..."
  }
}

// ↓ Converts to ↓

// Gemini Format (API)
{
  inlineData: {
    data: "ABC123...",
    mimeType: "image/png"
  }
}
```

#### For OpenAI

**File:** `extensions/roopik-dio/src/api/providers/openai-native.ts`
**Method:** Converts images in message content
**Lines:** 389-391

```typescript
case "image":
  const image = block as Anthropic.Messages.ImageBlockParam
  const imageUrl = `data:${image.source.media_type};base64,${image.source.data}`
  content.push({ type: "input_image", image_url: imageUrl })
```

**Conversion Example:**
```typescript
// Anthropic Format (Internal)
{
  type: "image",
  source: {
    type: "base64",
    media_type: "image/png",
    data: "ABC123..."
  }
}

// ↓ Converts to ↓

// OpenAI Format (API)
{
  type: "input_image",
  image_url: "data:image/png;base64,ABC123..."
}
```

#### For Anthropic (Native)

**File:** `extensions/roopik-dio/src/api/providers/anthropic.ts`
- **No conversion needed!** Already in Anthropic format
- Messages sent directly to API

#### For Other Providers

Each provider has its own transformer:
- **Mistral:** `extensions/roopik-dio/src/api/transform/mistral-format.ts`
- **OpenAI-compatible:** `extensions/roopik-dio/src/api/transform/openai-format.ts`
- **VSCode LM:** `extensions/roopik-dio/src/api/transform/vscode-lm-format.ts`
- **DeepSeek R1:** `extensions/roopik-dio/src/api/transform/r1-format.ts`

## Where Else Is This Used?

The same Anthropic → Provider conversion happens for ALL images, not just tool responses:

### 1. Direct Image Uploads (Paste/Drag-Drop)
**File:** `extensions/roopik-dio/src/core/webview/webviewMessageHandler.ts`
**Line:** 645
- User pastes/drags images into chat
- Converted to Anthropic format
- Stored in message history

### 2. Reading Image Files
**File:** `extensions/roopik-dio/src/core/tools/ReadFileTool.ts`
- When reading `.png`, `.jpg`, etc. files
- Converts to Anthropic image blocks

### 3. MCP Resources
**File:** `extensions/roopik-dio/src/core/tools/accessMcpResourceTool.ts`
**Lines:** 75-85
```typescript
if (item.mimeType?.startsWith("image") && item.blob) {
  // Convert to Anthropic format
  images.push({
    type: "image",
    source: {
      type: "base64",
      media_type: item.mimeType as any,
      data: item.blob,
    },
  })
}
```

### 4. Image Generation Tools
**File:** `extensions/roopik-dio/src/core/tools/GenerateImageTool.ts`
**Lines:** 114-115
- Generated images converted to Anthropic format
- Then displayed to LLM

## Key Benefits of This Architecture

### 1. Single Source of Truth
- All messages stored in one format (Anthropic)
- No confusion about which format to use internally
- Easy to debug and maintain

### 2. Provider-Agnostic Core
- Core logic doesn't care about provider-specific formats
- Add new providers by just creating a new transformer
- No need to modify tool handlers or message storage

### 3. Type Safety
- TypeScript types enforce Anthropic format internally
- Catch format errors at compile time
- Transformers handle provider-specific requirements

### 4. Flexibility
- Easy to switch between providers
- User can use different models without code changes
- Each provider's unique features handled in transformer

## How to Make Changes

### Adding a New Image Source

1. **Get the image data** (base64 string)
2. **Convert to Anthropic format:**
   ```typescript
   const imageBlock: Anthropic.ImageBlockParam = {
     type: "image",
     source: {
       type: "base64",
       media_type: "image/png", // or "image/jpeg", etc.
       data: base64Data,
     },
   }
   ```
3. **Add to message content** (it will auto-convert for all providers)

### Adding a New Provider

1. **Create provider file:** `extensions/roopik-dio/src/api/providers/newprovider.ts`
2. **Create transformer:** `extensions/roopik-dio/src/api/transform/newprovider-format.ts`
3. **Implement conversion function:**
   ```typescript
   export function convertAnthropicToNewProvider(
     message: Anthropic.Messages.MessageParam
   ): NewProviderMessage {
     // Handle "image" type blocks
     // Convert to provider's format
   }
   ```
4. **Use in provider:** Call converter before API request

### Modifying Image Handling

**To change how images are formatted for a specific provider:**
- Edit the corresponding transformer in `extensions/roopik-dio/src/api/transform/[provider]-format.ts`
- Look for the `case "image":` block
- Modify the output format

**To change how tools return images:**
- Edit `extensions/roopik-dio/src/core/tools/roopik/RoopikToolHandler.ts`
- Modify `formatToolResult()` function
- Keep output in Anthropic format for consistency

## Important Notes

### ⚠️ Do NOT Break the Contract
- Always return Anthropic format from tools
- Always convert to provider format before API call
- Never store provider-specific formats in message history

### ✅ The Pattern
```
Tool → Anthropic Format → Store → Convert → Provider API
  ↑                                            ↓
  └────────────── Response ──────────────────┘
```

### 🔍 Debugging Tips
If images aren't showing up:
1. Check tool returns correct base64 data
2. Verify `formatToolResult()` creates proper Anthropic blocks
3. Check provider transformer handles `"image"` type
4. Verify API request includes converted image data

## Related Files Reference

### Core Image Handling
- `extensions/roopik-dio/src/shared/tools.ts` - Type definitions
- `extensions/roopik-dio/src/core/tools/roopik/RoopikToolHandler.ts` - Tool result formatting
- `extensions/roopik-dio/src/integrations/misc/process-images.ts` - Image processing utilities

### Provider Implementations
- `extensions/roopik-dio/src/api/providers/anthropic.ts` - Anthropic (native)
- `extensions/roopik-dio/src/api/providers/gemini.ts` - Google Gemini
- `extensions/roopik-dio/src/api/providers/openai-native.ts` - OpenAI
- `extensions/roopik-dio/src/api/providers/mistral-native.ts` - Mistral

### Format Transformers
- `extensions/roopik-dio/src/api/transform/gemini-format.ts` - Anthropic → Gemini
- `extensions/roopik-dio/src/api/transform/openai-format.ts` - Anthropic → OpenAI
- `extensions/roopik-dio/src/api/transform/mistral-format.ts` - Anthropic → Mistral
- `extensions/roopik-dio/src/api/transform/r1-format.ts` - Anthropic → DeepSeek R1

### Image Sources
- `extensions/roopik-dio/src/core/tools/ReadFileTool.ts` - Reading image files
- `extensions/roopik-dio/src/core/tools/accessMcpResourceTool.ts` - MCP resources
- `extensions/roopik-dio/src/core/tools/GenerateImageTool.ts` - Image generation
- `extensions/roopik-dio/src/core/webview/webviewMessageHandler.ts` - User uploads

## Conclusion

The image handling architecture uses **Anthropic's message format as the internal standard** (the "lingua franca"), which provides:
- **Consistency** across all tools and features
- **Flexibility** to support any LLM provider
- **Maintainability** with clear separation of concerns
- **Type safety** with TypeScript enforcement

This is not hardcoded favoritism - it's a deliberate architectural choice to use one well-designed format internally and transform at the edges, following the **Adapter Pattern** and **Single Responsibility Principle**.
