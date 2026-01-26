#!/usr/bin/env node

/**
 * Roopik Eval CLI
 *
 * Run automated evaluations for Roopik IDE agent capabilities
 */

import path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { runCanvasCreationEval } from './evals/canvas-creation-ipc.js'
import {
	getAvailableProviders,
	detectAvailableProvider,
	getConfiguredProviders
} from './config/agent-config.js'
import { getEvalConfig } from './config/eval-config.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function main() {
	console.log('🎯 Roopik Evaluation Suite')
	console.log('━'.repeat(50))

	// Parse CLI arguments
	const args = process.argv.slice(2)
	const providerArg = args.find(arg => arg.startsWith('--provider='))
	const selectedProvider = providerArg?.split('=')[1]

	// Get configuration
	const config = getEvalConfig()

	// Show available providers
	const availableProviders = getAvailableProviders()
	const configuredProviders = getConfiguredProviders()
	const detectedProvider = detectAvailableProvider()

	console.log('\n📦 Available Providers:')
	availableProviders.forEach(p => {
		const isConfigured = configuredProviders.includes(p)
		const hasKey = isConfigured ? '✓' : '✗'
		const isDetected = p === detectedProvider ? ' ← selected' : ''
		const status = isConfigured ? 'configured' : 'not configured'
		console.log(`  ${hasKey} ${p} (${status})${isDetected}`)
	})

	if (configuredProviders.length > 1) {
		console.log(`\n💡 Multiple providers configured. Using priority: gemini > anthropic > openai > openrouter`)
		console.log(`   Override with: --provider=<name> or EVAL_PROVIDER=<name>`)
	}

	if (!detectedProvider && !selectedProvider) {
		console.error('\n❌ No API keys found!')
		console.error('Set one of the following in your .env file:')
		availableProviders.forEach(p => {
			const envVar = p === 'openrouter' ? 'OPENROUTER_API_KEY' :
				p === 'gemini' ? 'GEMINI_API_KEY' :
					p === 'anthropic' ? 'ANTHROPIC_API_KEY' :
						p === 'openai' ? 'OPENAI_API_KEY' :
							`${p.toUpperCase()}_API_KEY`
			console.error(`  - ${envVar}`)
		})
		process.exit(1)
	}

	// Create test workspace
	const workspaceName = `${config.workspacePrefix}-${Date.now()}`
	const workspacePath = path.join(process.cwd(), 'test-workspaces', workspaceName)

	console.log('\n📂 Setting up test workspace...')
	fs.mkdirSync(workspacePath, { recursive: true })

	// Create a simple package.json
	fs.writeFileSync(
		path.join(workspacePath, 'package.json'),
		JSON.stringify({
			name: workspaceName,
			version: '0.0.1',
			private: true
		}, null, 2)
	)

	console.log(`   Workspace: ${workspacePath}`)

	try {
		// Run the eval
		console.log('\n🚀 Running Canvas Creation Eval...\n')
		const { passed, result } = await runCanvasCreationEval(
			workspacePath,
			selectedProvider
		)

		console.log('\n' + '━'.repeat(50))
		if (passed) {
			console.log('✅ EVAL PASSED!')
		} else {
			console.log('❌ EVAL FAILED')
			process.exit(1)
		}

	} catch (error) {
		console.error('\n❌ Error running eval:', error)
		process.exit(1)
	} finally {
		// Cleanup
		console.log('\n🧹 Cleaning up test workspace...')
		try {
			fs.rmSync(workspacePath, { recursive: true, force: true })
			console.log('   Done!')
		} catch (e) {
			console.log('   ⚠️  Failed to cleanup:', e)
		}

		// Force exit to ensure process terminates
		// (Roopik process might have already exited but Node is waiting)
		process.exit(0)
	}
}

main().catch(error => {
	console.error('Fatal error:', error)
	process.exit(1)
})
