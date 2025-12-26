# Image Upload Failing - Model Validation Issue

## Problem

After removing cloud features, image upload stopped working across all providers. The image button was visible but disabled, and `model.supportsImages` was returning `undefined`.

## Root Cause

When switching API providers in settings, the validation logic in `onProviderChange()` had a flaw:

**The Issue**: Many providers share the same field (`apiModelId`):
- Anthropic, Gemini, Cerebras, DeepSeek, etc. all use `apiModelId`

When switching from Anthropic (with `claude-sonnet-4`) to Gemini:
1. Old logic checked: "Is `apiModelId` set?" → Yes (`claude-sonnet-4`)
2. Assumed: "User already has a model for Gemini"
3. Result: Gemini tried to use `claude-sonnet-4` which doesn't exist in Gemini's model list
4. `useSelectedModel()` returned `undefined` for model info
5. Image button disabled because `model?.supportsImages` was `undefined`

## Solution

Added smart model validation that checks if the current model is **valid for the new provider**:

```typescript
// File: webview/src/components/settings/ApiOptions.tsx

const validateAndResetModel = (
    modelId: string | undefined,
    field: keyof ProviderSettings,
    defaultValue?: string,
    newProvider?: ProviderName,
) => {
    if (!defaultValue) return

    // Check if we should set the default model:
    // 1. If no model is currently set, always set default
    // 2. If a model is set, check if it's valid for the NEW provider
    const shouldSetDefault = !modelId || (newProvider && !isModelValidForProvider(modelId, newProvider))

    if (shouldSetDefault) {
        setApiConfigurationField(field, defaultValue, false)
    }
}

// Helper to check if a model ID is valid for a given provider
const isModelValidForProvider = (modelId: string, provider: ProviderName): boolean => {
    const models = MODELS_BY_PROVIDER[provider]
    if (!models) return false
    return modelId in models
}
```

## Outcome

✅ When switching providers, automatically sets default model if current model is invalid for new provider
✅ Preserves user's model selection when switching back to previous provider
✅ Model dropdown never shows blank
✅ Image upload works for all providers on first configuration
