#!/usr/bin/env node

/**
 * Simple CLI to run Roopik evals using IPC
 * Based on Roo Code's approach
 */

import path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { runCanvasCreationEval } from './evals/canvas-creation-ipc.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function main() {
	console.log('🎯 Roopik Evaluation Suite (IPC Mode)')
	console.log('━'.repeat(50))

	// Create test workspace
	const workspaceName = `roopik-eval-${Date.now()}`
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
		const { passed, result } = await runCanvasCreationEval(workspacePath)

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
	}
}

main().catch(error => {
	console.error('Fatal error:', error)
	process.exit(1)
})
