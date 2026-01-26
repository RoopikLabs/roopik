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
 * Add new providers here to make them available for evals
 */
export const PROVIDER_REGISTRY: Record<string, ProviderConfig> = {
	gemini: {
		name: 'Google Gemini',
		apiProvider: 'gemini',
		modelId: 'gemini-4.0-flash-exp',
		apiKeyEnvVar: 'GEMINI_API_KEY',
		settings: {
			geminiModelId: 'gemini-4.0-flash-exp',
		},
	},

	openrouter: {
		name: 'OpenRouter',
		apiProvider: 'openrouter',
		modelId: 'google/gemini-2.0-flash-exp:free',
		apiKeyEnvVar: 'OPENROUTER_API_KEY',
		settings: {
			openRouterModelId: 'google/gemini-2.0-flash-exp:free',
		},
	},

	anthropic: {
		name: 'Anthropic Claude',
		apiProvider: 'anthropic',
		modelId: 'claude-sonnet-4-20250514',
		apiKeyEnvVar: 'ANTHROPIC_API_KEY',
		settings: {
			apiModelId: 'claude-sonnet-4-20250514',
		},
	},

	openai: {
		name: 'OpenAI',
		apiProvider: 'openai',
		modelId: 'gpt-4o',
		apiKeyEnvVar: 'OPENAI_API_KEY',
		settings: {
			openAiModelId: 'gpt-4o',
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

	// Get API key from parameter or environment
	const key = apiKey || process.env[provider.apiKeyEnvVar]
	if (!key) {
		throw new Error(
			`API key not found for ${provider.name}. ` +
			`Set ${provider.apiKeyEnvVar} environment variable.`
		)
	}

	// Build complete settings
	return {
		apiProvider: provider.apiProvider,
		[`${provider.apiProvider}ApiKey`]: key,
		...provider.settings,
		...AGENT_EVAL_SETTINGS,
	}
}

/**
 * Auto-detect available provider from environment
 *
 * Priority order (if multiple API keys are set):
 * 1. gemini
 * 2. openrouter
 * 3. anthropic
 * 4. openai
 *
 * To override, set EVAL_PROVIDER environment variable or use --provider CLI flag
 */
export function detectAvailableProvider(): string | null {
	// Define priority order
	const priorityOrder = ['gemini', 'openrouter', 'anthropic', 'openai']

	// Check in priority order
	for (const providerName of priorityOrder) {
		const config = PROVIDER_REGISTRY[providerName]
		if (config && process.env[config.apiKeyEnvVar]) {
			return providerName
		}
	}

	// Fallback: check any other providers not in priority list
	for (const [name, config] of Object.entries(PROVIDER_REGISTRY)) {
		if (!priorityOrder.includes(name) && process.env[config.apiKeyEnvVar]) {
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
