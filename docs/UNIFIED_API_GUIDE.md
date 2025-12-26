# Unified API Interface Guide

## Overview

This document explains the recommended approach for providing a simplified, unified API interface for Roopik Agent users who want to use multiple AI providers without managing individual API keys.

## TL;DR: Use OpenRouter

**Recommendation: Use [OpenRouter](https://openrouter.ai/) instead of building a custom API proxy.**

OpenRouter already provides exactly what you need:
- Single API key for 100+ AI models
- OpenAI-compatible API format
- Pay-per-use pricing (no subscription required)
- Support for all major providers (Anthropic, OpenAI, Google, Meta, etc.)
- Usage tracking and cost management
- Free tier available for testing

## Why OpenRouter?

### 1. Already Built and Maintained
- Production-ready service used by thousands of developers
- Handles rate limiting, retries, and error handling
- Regular updates as new models are released
- No infrastructure costs or maintenance burden

### 2. Simple Integration
Roopik Agent already supports OpenAI-compatible APIs. Users can configure OpenRouter in seconds:

```json
{
  "apiProvider": "openai-compatible",
  "baseUrl": "https://openrouter.ai/api/v1",
  "apiKey": "your-openrouter-key"
}
```

### 3. Better Economics
- No need to maintain servers, databases, or payment processing
- No liability for API key security or rate limiting
- No customer support burden for API issues
- Users pay OpenRouter directly (you stay out of billing)

### 4. Feature-Rich
- **Model Selection**: Access to 100+ models through one interface
- **Streaming**: Full streaming support for real-time responses
- **Cost Tracking**: Built-in usage analytics
- **Fallbacks**: Automatic failover to similar models
- **Caching**: Prompt caching to reduce costs

## Alternative: Custom API Proxy

If you still want to build a custom solution, here's what's involved:

### Requirements

**Infrastructure:**
- API gateway with authentication
- Request routing/proxy logic
- Rate limiting and quota management
- Usage tracking database
- Payment processing integration
- User management system

**Maintenance:**
- Keep up with provider API changes
- Handle model deprecations
- Monitor service health
- Provide customer support
- Manage security vulnerabilities

**Estimated Effort:**
- Initial development: 2-4 weeks
- Ongoing maintenance: 4-8 hours/week
- Infrastructure costs: $50-200/month minimum

### Architecture Example

If building custom:

```
User → Your API Gateway
     ↓
  Auth & Rate Limiting
     ↓
  Usage Tracking DB
     ↓
  Provider Router
     ├─→ OpenAI API
     ├─→ Anthropic API
     ├─→ Google API
     └─→ etc.
```

**Key Components:**
1. **Authentication Layer**: JWT/API key validation
2. **Routing Logic**: Map model names to provider endpoints
3. **Request Transformation**: Convert requests to provider formats
4. **Response Normalization**: Standardize responses
5. **Usage Tracking**: Log requests for billing
6. **Error Handling**: Retry logic and fallbacks

## Recommended Approach for Roopik

### Phase 1: Document OpenRouter Setup (Current)
Create a user guide showing how to configure OpenRouter with Roopik Agent:

```markdown
# Using Multiple AI Models with One API Key

1. Sign up at https://openrouter.ai/
2. Get your API key from the dashboard
3. In Roopik Agent settings:
   - Provider: OpenAI-Compatible
   - Base URL: https://openrouter.ai/api/v1
   - API Key: [your OpenRouter key]
   - Model: Choose from 100+ models (e.g., anthropic/claude-3.5-sonnet)
```

### Phase 2: UI Simplification (Optional)
Add an "OpenRouter" provider type to Roopik Agent's settings UI:
- Pre-fill the base URL
- Link to OpenRouter's model list
- Show cost estimates per model

### Phase 3: Documentation & Education
Create guides for:
- Comparing model costs and capabilities
- Setting up billing limits in OpenRouter
- Choosing the right model for different tasks
- Cost optimization strategies

## Cost Comparison Example

### OpenRouter (Pay-as-you-go)
- Claude 3.5 Sonnet: $3/$15 per 1M tokens (input/output)
- GPT-4: $10/$30 per 1M tokens
- Free models available (Llama 3, Mistral, etc.)
- **Total user cost**: Actual usage only

### Custom Solution
- Server hosting: $50-200/month
- Database: $20-50/month
- Development time: $5,000-10,000 (initial)
- Maintenance: $500-1,000/month
- **Total ongoing cost**: $570-1,250/month + markup on API usage

## Security Considerations

### OpenRouter
- Users manage their own API keys
- OpenRouter handles key security and rotation
- No liability for leaked keys

### Custom Proxy
- You store user API keys (security risk)
- Need encryption at rest and in transit
- Liability if keys are compromised
- Need compliance certifications (SOC 2, GDPR, etc.)

## Conclusion

**For Roopik IDE:**

1. **Immediate Action**: Document OpenRouter setup in user guides
2. **Short Term**: Add OpenRouter as a built-in provider option in settings UI
3. **Long Term**: Focus development on IDE features, not API infrastructure

**Key Benefits:**
- ✅ Zero infrastructure costs
- ✅ Zero maintenance burden
- ✅ Professional service quality
- ✅ Users control their own billing
- ✅ Access to latest models automatically
- ✅ No security liability
- ✅ More time to focus on Roopik's core features

**Only Build Custom If:**
- You plan to raise funding and build a platform business
- You need proprietary model routing/optimization
- You want to resell API access with markup
- You have compliance requirements that prohibit third-party APIs

For an IDE project focused on developer experience, **OpenRouter is the clear choice**.

## Implementation Guide for Roopik

### Update Settings UI

Add OpenRouter as a first-class provider in `extensions/roopik-dio/webview/src/components/settings`:

```typescript
const providers = [
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'openrouter', name: 'OpenRouter (All Models)', recommended: true },
  // ... other providers
]
```

### Pre-configure OpenRouter Settings

```typescript
const openRouterDefaults = {
  baseUrl: 'https://openrouter.ai/api/v1',
  supportsStreaming: true,
  supportsPromptCache: true
}
```

### Add Model Picker

Show OpenRouter's model list with cost info:
- Fetch from `https://openrouter.ai/api/v1/models`
- Display model name, context window, and pricing
- Allow filtering by provider, cost, or capability

### Link to Documentation

Add help text with OpenRouter setup instructions and link to their docs.

---

**Last Updated**: January 2025
**Status**: Recommended approach for unified API access
