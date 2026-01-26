/**
 * Agent Evaluation Configuration
 *
 * This module provides configuration for running automated evals
 * on AI coding agents.
 */

/**
 * Standard agent settings for automated evaluation
 * These settings ensure the agent runs without user intervention
 */
export const AGENT_EVAL_SETTINGS = {
	// Auto-approval settings - allow agent to work autonomously
	autoApprovalEnabled: true,
	alwaysAllowReadOnly: true,
	alwaysAllowWrite: true,
	alwaysAllowBrowser: true,
	alwaysAllowMcp: true,
	alwaysAllowRoopik: true,
	alwaysAllowModeSwitch: true,
	alwaysAllowSubtasks: true,
	alwaysAllowExecute: true,
	alwaysAllowFollowupQuestions: true,

	// Timeout settings
	writeDelayMs: 1000,
	requestDelaySeconds: 10,
	commandExecutionTimeout: 20,
	followupAutoApproveTimeoutMs: 0,

	// Permissions
	allowedCommands: ['*'],
	commandTimeoutAllowlist: [],
	preventCompletionWithOpenTodos: false,

	// Features
	diffEnabled: true,
	diagnosticsEnabled: true,
	mcpEnabled: false,
	browserToolEnabled: false,
	ttsEnabled: false,
	soundEnabled: false,
} as const

/**
 * Provider configuration interface
 */
export interface ProviderConfig {
	name: string
	apiProvider: string
	modelId: string
	apiKeyEnvVar: string
	settings: Record<string, any>
}

/**
 * Registry of supported providers
 *
 * IMPORTANT: Each provider uses different model ID keys!
 * See packages/types/src/provider-settings.ts:modelIdKeysByProvider
 *
 * Common patterns:
 * - Most providers: apiModelId (Gemini, Anthropic, Mistral, etc.)
 * - OpenRouter: openRouterModelId
 * - OpenAI: openAiModelId
 * - Ollama: ollamaModelId
 * - LM Studio: lmStudioModelId
 *
 * Add new providers here to make them available for evals
 */
export const PROVIDER_REGISTRY: Record<string, ProviderConfig> = {
	gemini: {
		name: 'Google Gemini',
		apiProvider: 'gemini',
		modelId: 'gemini-3-flash-preview',
		apiKeyEnvVar: 'GEMINI_API_KEY',
		settings: {
			// Gemini uses apiModelId (see provider-settings.ts:574)
			apiModelId: 'gemini-3-flash-preview',
		},
	},

	openrouter: {
		name: 'OpenRouter',
		apiProvider: 'openrouter',
		modelId: 'google/gemini-2.0-flash-exp:free',
		apiKeyEnvVar: 'OPENROUTER_API_KEY',
		settings: {
			// OpenRouter uses openRouterModelId (see provider-settings.ts:567)
			openRouterModelId: 'google/gemini-2.0-flash-exp:free',
		},
	},

	anthropic: {
		name: 'Anthropic Claude',
		apiProvider: 'anthropic',
		modelId: 'claude-sonnet-4-20250514',
		apiKeyEnvVar: 'ANTHROPIC_API_KEY',
		settings: {
			// Anthropic uses apiModelId (see provider-settings.ts:565)
			apiModelId: 'claude-sonnet-4-20250514',
		},
	},

	openai: {
		name: 'OpenAI',
		apiProvider: 'openai-native',
		modelId: 'gpt-4o',
		apiKeyEnvVar: 'OPENAI_API_KEY',
		settings: {
			// OpenAI uses openAiModelId (see provider-settings.ts:571)
			openAiModelId: 'gpt-4o',
		},
	},

	// Local providers - no API key needed!
	ollama: {
		name: 'Ollama (Local)',
		apiProvider: 'ollama',
		modelId: 'llama3.2',  // Default, overridden by OLLAMA_MODEL_ID
		apiKeyEnvVar: 'OLLAMA_API_KEY',  // Optional, usually not needed
		settings: {
			// Ollama uses ollamaModelId (see provider-settings.ts:572)
			// Note: These will be set dynamically in buildProviderSettings
		},
	},

	lmstudio: {
		name: 'LM Studio (Local)',
		apiProvider: 'lmstudio',
		modelId: 'local-model',  // Default, overridden by LMSTUDIO_MODEL_ID
		apiKeyEnvVar: 'LMSTUDIO_API_KEY',  // Optional, usually not needed
		settings: {
			// LM Studio uses lmStudioModelId (see provider-settings.ts:573)
			// Note: These will be set dynamically in buildProviderSettings
		},
	},
}

/**
 * Get provider configuration by name
 */
export function getProviderConfig(providerName: string): ProviderConfig | null {
	return PROVIDER_REGISTRY[providerName] || null
}

/**
 * Get all available provider names
 */
export function getAvailableProviders(): string[] {
	return Object.keys(PROVIDER_REGISTRY)
}

/**
 * Build complete settings for a provider
 * Merges provider-specific settings with agent eval settings
 */
export function buildProviderSettings(
	providerName: string,
	apiKey?: string
): Record<string, any> | null {
	const provider = getProviderConfig(providerName)
	if (!provider) {
		return null
	}

	// Local providers (Ollama, LM Studio) don't require API keys
	const localProviders = ['ollama', 'lmstudio']
	const isLocalProvider = localProviders.includes(providerName)

	// Get API key from parameter or environment
	const key = apiKey || process.env[provider.apiKeyEnvVar]
	if (!key && !isLocalProvider) {
		throw new Error(
			`API key not found for ${provider.name}. ` +
			`Set ${provider.apiKeyEnvVar} environment variable.`
		)
	}

	// Build complete settings
	const baseSettings: Record<string, any> = {
		apiProvider: provider.apiProvider,
		...provider.settings,
		...AGENT_EVAL_SETTINGS,
	}

	// Add API key if present (not needed for local providers)
	if (key) {
		baseSettings[`${provider.apiProvider}ApiKey`] = key
	}

	// Add dynamic settings for local providers (read from env at runtime!)
	if (providerName === 'ollama') {
		const modelFromEnv = process.env.OLLAMA_MODEL_ID
		const baseUrlFromEnv = process.env.OLLAMA_BASE_URL
		console.log(`🔍 DEBUG - OLLAMA_MODEL_ID from env: "${modelFromEnv}"`)
		console.log(`🔍 DEBUG - OLLAMA_BASE_URL from env: "${baseUrlFromEnv}"`)

		baseSettings.ollamaModelId = modelFromEnv || 'llama3.2'
		baseSettings.ollamaBaseUrl = baseUrlFromEnv || 'http://localhost:11434'
		console.log(`🔧 Ollama config: ${baseSettings.ollamaModelId} @ ${baseSettings.ollamaBaseUrl}`)
	}

	if (providerName === 'lmstudio') {
		const modelFromEnv = process.env.LMSTUDIO_MODEL_ID
		const baseUrlFromEnv = process.env.LMSTUDIO_BASE_URL
		console.log(`🔍 DEBUG - LMSTUDIO_MODEL_ID from env: "${modelFromEnv}"`)
		console.log(`🔍 DEBUG - LMSTUDIO_BASE_URL from env: "${baseUrlFromEnv}"`)

		baseSettings.lmStudioModelId = modelFromEnv || 'local-model'
		baseSettings.lmStudioBaseUrl = baseUrlFromEnv || 'http://localhost:1234/v1'
		console.log(`🔧 LM Studio config: ${baseSettings.lmStudioModelId} @ ${baseSettings.lmStudioBaseUrl}`)
	}

	return baseSettings
}

/**
 * Auto-detect available provider from environment
 *
 * Priority order (if multiple API keys are set):
 * 1. gemini
 * 2. openrouter
 * 3. anthropic
 * 4. openai
 * 5. ollama (if running locally)
 * 6. lmstudio (if running locally)
 *
 * To override, set EVAL_PROVIDER environment variable or use --provider CLI flag
 */
export function detectAvailableProvider(): string | null {
	// Define priority order for cloud providers
	const priorityOrder = ['gemini', 'openrouter', 'anthropic', 'openai']

	// Check cloud providers in priority order
	for (const providerName of priorityOrder) {
		const config = PROVIDER_REGISTRY[providerName]
		if (config && process.env[config.apiKeyEnvVar]) {
			return providerName
		}
	}

	// Check local providers (Ollama, LM Studio)
	// These don't need API keys, just check if base URL is configured
	const localProviders = ['ollama', 'lmstudio']
	for (const providerName of localProviders) {
		const baseUrlKey = providerName === 'ollama' ? 'OLLAMA_BASE_URL' : 'LMSTUDIO_BASE_URL'
		if (process.env[baseUrlKey]) {
			return providerName
		}
	}

	// Fallback: check any other providers not in priority list
	for (const [name, config] of Object.entries(PROVIDER_REGISTRY)) {
		if (!priorityOrder.includes(name) && !localProviders.includes(name) && process.env[config.apiKeyEnvVar]) {
			return name
		}
	}

	return null
}

/**
 * Get all providers that have API keys configured
 */
export function getConfiguredProviders(): string[] {
	return Object.entries(PROVIDER_REGISTRY)
		.filter(([_, config]) => process.env[config.apiKeyEnvVar])
		.map(([name]) => name)
}
