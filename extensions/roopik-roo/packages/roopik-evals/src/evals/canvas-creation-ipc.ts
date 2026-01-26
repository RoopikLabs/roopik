/**
 * Canvas Creation Eval
 *
 * Tests if the agent can create a canvas when prompted.
 */

import { runEvalWithIpc } from '../ipc-runner.js'
import { RooCodeEventName } from '@roo-code/types'
import {
	buildProviderSettings,
	detectAvailableProvider,
	getProviderConfig
} from '../config/agent-config.js'
import { getEvalConfig } from '../config/eval-config.js'

export async function runCanvasCreationEval(
	workspacePath: string,
	providerName?: string
) {
	console.log('📝 Running Canvas Creation Eval...')

	const prompt = 'Create a new canvas called "Login Page" for designing a login screen.'

	// Get eval configuration
	const evalConfig = getEvalConfig()

	// Determine which provider to use
	const provider = providerName || evalConfig.provider
	const selectedProvider = provider === 'auto'
		? detectAvailableProvider()
		: provider

	if (!selectedProvider) {
		throw new Error(
			'No provider configured. Set GEMINI_API_KEY, OPENROUTER_API_KEY, ' +
			'or another supported provider API key in your .env file.'
		)
	}

	// Build settings for the selected provider
	const settings = buildProviderSettings(selectedProvider)
	if (!settings) {
		throw new Error(`Unknown provider: ${selectedProvider}`)
	}

	const providerConfig = getProviderConfig(selectedProvider)!
	console.log(`🔑 Provider: ${providerConfig.name}`)

	// Show actual model being used (important for local providers)
	const actualModel = settings.ollamaModelId || settings.lmStudioModelId || providerConfig.modelId
	console.log(`🤖 Model: ${actualModel}`)
	console.log(`✅ Auto-approval: ENABLED`)

	// Run the eval
	const result = await runEvalWithIpc({
		roopikPath: evalConfig.roopikPath,
		workspacePath,
		prompt,
		timeout: evalConfig.timeout,
		settings,
	})

	console.log('\n' + '='.repeat(50))
	console.log('📊 EVAL RESULTS')
	console.log('='.repeat(50))
	console.log(`Success: ${result.success}`)
	console.log(`Task ID: ${result.taskId}`)
	console.log(`Duration: ${result.duration}ms`)
	console.log(`Events: ${result.events.length}`)

	if (result.error) {
		console.log(`Error: ${result.error}`)
	}

	// Analyze events to see if canvas was created
	const toolEvents = result.events.filter(e =>
		e.eventName === RooCodeEventName.Message &&
		e.payload && e.payload[0] && typeof e.payload[0] !== 'string' && e.payload[0].message?.ask === 'tool'
	)

	console.log(`\n🔧 Tool calls: ${toolEvents.length}`)
	toolEvents.forEach((event, i) => {
		try {
			if (!event.payload || !event.payload[0] || typeof event.payload[0] === 'string') return
			const text = event.payload[0].message?.text
			if (text) {
				const toolData = JSON.parse(text)
				console.log(`  ${i + 1}. ${toolData.tool}`)
			}
		} catch (e) {
			// Ignore parse errors
		}
	})

	// Check if createCanvas was called
	const createdCanvas = toolEvents.some(event => {
		try {
			if (!event.payload || !event.payload[0] || typeof event.payload[0] === 'string') return false
			const text = event.payload[0].message?.text
			if (text) {
				const toolData = JSON.parse(text)
				return toolData.tool === 'canvas_create' ||
					toolData.tool === 'roopik_create_canvas' ||
					toolData.tool === 'createCanvas'
			}
		} catch (e) {
			return false
		}
		return false
	})

	console.log(`\n${createdCanvas ? '✅' : '❌'} Canvas creation tool called: ${createdCanvas}`)
	console.log('='.repeat(50))

	return {
		passed: result.success && createdCanvas,
		result,
	}
}
