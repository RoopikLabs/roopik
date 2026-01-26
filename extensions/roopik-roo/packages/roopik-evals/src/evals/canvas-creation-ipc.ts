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
import { EventRecorder } from '../core/recorder.js'
import { MetricsAnalyzer } from '../core/metrics.js'
import { Database } from '../core/database.js'

export async function runCanvasCreationEval(
	workspacePath: string,
	providerName?: string
) {
	console.log('📝 Running Canvas Creation Eval...')

	const evalId = 'canvas-create'
	const evalName = 'Canvas Creation'
	const prompt = 'Create a new canvas called "Login Page" for designing a login screen.'
	const expectedTools = ['switchMode', 'canvas_create']

	const startTime = Date.now()
	const runId = `run-${startTime}`

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
	const actualModel = settings.ollamaModelId || settings.lmStudioModelId ||
		settings.apiModelId || providerConfig.modelId

	console.log(`🔑 Provider: ${providerConfig.name}`)
	console.log(`🤖 Model: ${actualModel}`)
	console.log(`✅ Auto-approval: ENABLED`)

	// Create event recorder
	const recorder = new EventRecorder(
		runId,
		evalId,
		selectedProvider,
		actualModel
	)

	console.log(`📁 Recording to: ${recorder.getResultsDir()}`)

	// Run the eval with recorder
	const result = await runEvalWithIpc({
		roopikPath: evalConfig.roopikPath,
		workspacePath,
		prompt,
		timeout: evalConfig.timeout,
		settings,
		recorder,
		expectedTools,
	})

	const endTime = Date.now()

	// Save events to disk
	await recorder.saveEvents()

	// Calculate metrics
	const metrics = MetricsAnalyzer.analyze(
		recorder.getMetadata().events,
		expectedTools,
		startTime,
		endTime,
		result.success,
		result.error
	)

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

	// Display tool calls
	console.log(`\n🔧 Tool calls: ${metrics.totalToolCalls}`)
	metrics.actualTools?.forEach((tool, i) => {
		console.log(`  ${i + 1}. ${tool}`)
	})

	// Check if canvas was created
	const createdCanvas = metrics.actualTools?.includes('canvas_create') || false

	console.log(`\n${createdCanvas ? '✅' : '❌'} Canvas creation tool called: ${createdCanvas}`)

	// Display metrics
	console.log('\n📈 Metrics:')
	console.log(`  Tool Precision: ${((metrics.toolPrecision || 0) * 100).toFixed(1)}%`)
	console.log(`  Tool Recall: ${((metrics.toolRecall || 0) * 100).toFixed(1)}%`)
	console.log(`  F1 Score: ${((metrics.toolF1Score || 0) * 100).toFixed(1)}%`)
	console.log(`  Unnecessary Actions: ${metrics.unnecessaryActions || 0}`)
	console.log(`  Retries: ${metrics.retries || 0}`)
	console.log(`  Tokens In: ${metrics.tokensIn || 0}`)
	console.log(`  Tokens Out: ${metrics.tokensOut || 0}`)
	console.log(`  Cost: $${(metrics.costUsd || 0).toFixed(4)}`)
	console.log('='.repeat(50))

	// Save to database
	const db = new Database()
	db.insertRun({
		id: runId,
		evalId,
		evalName,
		provider: selectedProvider,
		model: actualModel,
		startedAt: new Date(startTime).toISOString(),
		completedAt: new Date(endTime).toISOString(),
		metrics: {
			...metrics,
			outputCorrect: createdCanvas,
			completenessScore: createdCanvas ? 1.0 : 0.0,
			missingElements: createdCanvas ? 0 : 1,
		} as any,
	})

	// Save summary
	await recorder.saveSummary({
		success: result.success,
		taskId: result.taskId,
		duration: result.duration,
		events: result.events.length,
		error: result.error,
		metrics: {
			...metrics,
			outputCorrect: createdCanvas,
			completenessScore: createdCanvas ? 1.0 : 0.0,
			missingElements: createdCanvas ? 0 : 1,
		},
		passed: result.success && createdCanvas,
	})

	console.log(`\n💾 Results saved to: ${recorder.getResultsDir()}`)
	console.log(`📊 Database updated`)

	return {
		passed: result.success && createdCanvas,
		result,
		metrics,
	}
}
