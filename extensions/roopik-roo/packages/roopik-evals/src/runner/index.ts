/**
 * Eval test runner - Executed inside VSCode/Roopik context
 * This file is loaded by the VSCode test runner
 */

import * as path from 'path'
import { fileURLToPath } from 'url'
import Mocha from 'mocha'
import { glob } from 'glob'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export async function run(): Promise<void> {
	// Create the mocha test runner
	const mocha = new Mocha({
		ui: 'bdd',
		color: true,
		timeout: 120000 // 2 minutes default timeout
	})

	const testsRoot = path.resolve(__dirname, '..')

	// Find all eval test files
	console.log(`🔎 Searching for eval tests in ${testsRoot}...`)
	const files = await glob('**/**.eval.js', { cwd: testsRoot })
	console.log(`📂 Found ${files.length} test files:`, files)

	// Add files to the test suite
	files.forEach((f: string) => {
		const filePath = path.resolve(testsRoot, f)
		console.log(`➕ Adding test file: ${filePath}`)
		mocha.addFile(filePath)
	})

	console.log('🚀 Starting Mocha runner...')
	return new Promise((resolve, reject) => {
		try {
			mocha.run((failures: number) => {
				if (failures > 0) {
					reject(new Error(`${failures} tests failed.`))
				} else {
					resolve()
				}
			})
		} catch (err) {
			console.error(err)
			reject(err)
		}
	})
}
