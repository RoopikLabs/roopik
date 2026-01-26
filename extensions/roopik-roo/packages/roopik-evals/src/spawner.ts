/**
 * Spawns headless Roopik IDE for running evals
 */

import { runTests } from '@vscode/test-electron'
import path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { RoopikSpawnConfig } from './types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Default Roopik installation path on Windows
 */
export const DEFAULT_ROOPIK_PATH = 'C:\\Users\\Humblebee\\AppData\\Local\\Programs\\Roopik\\Roopik.exe'

/**
 * Spawn headless Roopik IDE and run tests
 *
 * @param config - Spawn configuration
 * @returns Exit code (0 = success, non-zero = failure)
 */
export async function spawnRoopik(config: RoopikSpawnConfig): Promise<number> {
	const {
		roopikPath,
		workspacePath,
		extensionTestsPath,
		launchArgs = [],
		disableExtensions = false
	} = config

	console.log('🚀 Spawning Roopik IDE...')
	console.log('  Executable:', roopikPath)
	console.log('  Workspace:', workspacePath)
	console.log('  Tests:', extensionTestsPath)

	const userDataDir = path.join(workspacePath, '.user-data')
	const extensionsDir = path.join(workspacePath, '.extensions')

	console.log('  User Data Dir:', userDataDir)
	console.log('  Extensions Dir:', extensionsDir)

	const args = [
		workspacePath,
		'--skip-welcome',
		'--skip-release-notes',
		'--disable-workspace-trust',
		`--user-data-dir=${userDataDir}`,
		`--extensions-dir=${extensionsDir}`,
		...launchArgs
	]

	// Optionally disable extensions (but roopik-roo should still load as it's built-in)
	if (disableExtensions) {
		args.push('--disable-extensions')
	}

	try {
		// For Roopik, the extension is built-in, but VSCode test runner still needs this path
		// Point to the roopik-roo extension directory
		const extensionDevPath = path.resolve(__dirname, '..', '..', '..')

		const exitCode = await runTests({
			vscodeExecutablePath: roopikPath,
			extensionDevelopmentPath: extensionDevPath,
			launchArgs: args,
			extensionTestsPath: extensionTestsPath
		})

		return exitCode
	} catch (error) {
		console.error('❌ Failed to spawn Roopik:', error)
		throw error
	}
}

/**
 * Create a test workspace directory
 * Returns path to workspace
 */
export function createTestWorkspace(basePath?: string): string {
	const workspaceName = `roopik-eval-workspace-${Date.now()}`
	const workspacePath = basePath
		? path.join(basePath, workspaceName)
		: path.join(process.cwd(), 'test-workspaces', workspaceName)

	// Create workspace directory
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

	return workspacePath
}

/**
 * Clean up test workspace
 */
export function cleanupTestWorkspace(workspacePath: string): void {
	if (fs.existsSync(workspacePath)) {
		fs.rmSync(workspacePath, { recursive: true, force: true })
	}
}
