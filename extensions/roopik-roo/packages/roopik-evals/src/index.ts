#!/usr/bin/env node

/**
 * Roopik Evals CLI
 *
 * Usage:
 *   npm test                    # Run all evals
 *   npm test -- --eval canvas   # Run specific eval
 */

import path from 'path'
import { fileURLToPath } from 'url'
import { spawnRoopik, DEFAULT_ROOPIK_PATH, createTestWorkspace, cleanupTestWorkspace } from './spawner.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function main() {
	console.log('🎯 Roopik Evaluation Suite')
	console.log('━'.repeat(50))

	// Parse CLI arguments
	const args = process.argv.slice(2)
	const specificEval = args.find(arg => arg.startsWith('--eval='))?.split('=')[1]

	if (specificEval) {
		console.log(`📋 Running specific eval: ${specificEval}`)
	} else {
		console.log('📋 Running all evals')
	}

	// Create test workspace
	console.log('\n📂 Setting up test workspace...')
	const workspacePath = createTestWorkspace()
	console.log(`   Workspace: ${workspacePath}`)

	// Determine extension tests path
	// VSCode/Roopik expects the COMPILED javascript files
	const extensionTestsPath = path.resolve(__dirname, '..', 'dist', 'runner', 'index.js')
	console.log(`   Tests: ${extensionTestsPath}`)

	try {
		// Spawn Roopik and run tests
		console.log('\n🚀 Launching Roopik IDE...')
		const exitCode = await spawnRoopik({
			roopikPath: DEFAULT_ROOPIK_PATH,
			workspacePath,
			extensionTestsPath,
			disableExtensions: false // Keep roopik-roo enabled
		})

		console.log('\n' + '━'.repeat(50))

		if (exitCode === 0) {
			console.log('✅ All evals passed!')
		} else {
			console.log('❌ Some evals failed')
			process.exit(exitCode)
		}

	} catch (error) {
		console.error('\n❌ Error running evals:', error)
		process.exit(1)
	} finally {
		// Cleanup
		console.log('\n🧹 Cleaning up test workspace...')
		cleanupTestWorkspace(workspacePath)
		console.log('   Done!')
	}
}

// Run
main().catch(error => {
	console.error('Fatal error:', error)
	process.exit(1)
})
