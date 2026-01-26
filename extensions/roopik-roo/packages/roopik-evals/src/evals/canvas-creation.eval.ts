/**
 * Canvas Creation Eval
 *
 * Tests if the agent can successfully create a canvas in Roopik IDE
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import { waitFor } from '../utils.js'

suite('Canvas Creation Eval', () => {
	test('Agent creates canvas with simple prompt', async function () {
		this.timeout(120000) // 2 minute timeout

		console.log('📝 Starting canvas creation eval...')

		// STEP 1: Get initial canvas count
		console.log('1️⃣ Getting initial canvas count...')
		const beforeResult = await vscode.commands.executeCommand<any>(
			'roopik.tools.listCanvases'
		)

		assert.ok(beforeResult, 'listCanvases should return a result')
		assert.strictEqual(beforeResult.success, true, 'listCanvases should succeed')

		const initialCount = beforeResult.data?.count || 0
		console.log(`   Initial canvas count: ${initialCount}`)

		// STEP 2: Trigger agent to create canvas
		console.log('2️⃣ Triggering agent with prompt...')
		const prompt = 'Create a new canvas for a login page'

		// TODO: Replace this with actual agent trigger
		// For now, we'll directly call the Roopik API as a proof-of-concept
		// In real eval, this would trigger the agent which would then call createCanvas
		console.log(`   Prompt: "${prompt}"`)
		console.log('   ⚠️  Direct API call (simulating agent action)')

		const createResult = await vscode.commands.executeCommand<any>(
			'roopik.tools.createCanvas',
			{ name: 'Login Page' }
		)

		assert.ok(createResult, 'createCanvas should return a result')
		assert.strictEqual(createResult.success, true, 'createCanvas should succeed')
		assert.ok(createResult.data?.canvasId, 'Should return a canvas ID')

		console.log(`   ✅ Canvas created: ${createResult.data.canvasId}`)

		// STEP 3: Wait a bit for state to update
		await new Promise(resolve => setTimeout(resolve, 500))

		// STEP 4: Verify canvas was created
		console.log('3️⃣ Verifying canvas creation...')
		const afterResult = await vscode.commands.executeCommand<any>(
			'roopik.tools.listCanvases'
		)

		assert.ok(afterResult, 'listCanvases should return a result')
		assert.strictEqual(afterResult.success, true, 'listCanvases should succeed')

		const afterCount = afterResult.data?.count || 0
		console.log(`   Final canvas count: ${afterCount}`)

		assert.strictEqual(
			afterCount,
			initialCount + 1,
			`Canvas count should increase by 1 (was ${initialCount}, now ${afterCount})`
		)

		// STEP 5: Verify canvas details
		const canvases = afterResult.data?.canvases || []
		const newCanvas = canvases.find((c: any) =>
			c.name === 'Login Page'
		)

		assert.ok(newCanvas, 'Canvas with name "Login Page" should exist')
		assert.strictEqual(newCanvas.componentCount, 0, 'New canvas should have 0 components')

		console.log('   ✅ Canvas verified!')
		console.log(`      ID: ${newCanvas.id}`)
		console.log(`      Name: ${newCanvas.name}`)
		console.log(`      Components: ${newCanvas.componentCount}`)

		// STEP 6: Cleanup - Remove test canvas
		console.log('4️⃣ Cleaning up test canvas...')
		// Note: We don't have a deleteCanvas API yet, so this canvas will remain
		// In the future, add cleanup here

		console.log('✅ Canvas creation eval PASSED!')
	})

	test('Agent creates canvas with descriptive name', async function () {
		this.timeout(120000)

		console.log('📝 Testing canvas creation with descriptive prompt...')

		const beforeResult = await vscode.commands.executeCommand<any>(
			'roopik.tools.listCanvases'
		)
		const initialCount = beforeResult.data?.count || 0

		// Create a canvas with a more descriptive name
		const createResult = await vscode.commands.executeCommand<any>(
			'roopik.tools.createCanvas',
			{ name: 'E-Commerce Dashboard' }
		)

		assert.strictEqual(createResult.success, true)
		assert.ok(createResult.data?.canvasId)

		// Verify
		const afterResult = await vscode.commands.executeCommand<any>(
			'roopik.tools.listCanvases'
		)
		const afterCount = afterResult.data?.count || 0

		assert.strictEqual(afterCount, initialCount + 1)

		const canvases = afterResult.data?.canvases || []
		const newCanvas = canvases.find((c: any) =>
			c.name === 'E-Commerce Dashboard'
		)

		assert.ok(newCanvas, 'Canvas should be created with correct name')

		console.log('✅ Descriptive canvas name eval PASSED!')
	})
})
