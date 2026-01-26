/**
 * Simple Canvas Creation Eval using IPC
 *
 * This eval tests if the agent can create a canvas when prompted.
 */

import * as vscode from 'vscode'
import { runEvalWithIpc } from '../ipc-runner.js'
import { RooCodeEventName } from '@roo-code/types'

const ROOPIK_PATH = 'C:\\Users\\Humblebee\\AppData\\Local\\Programs\\Roopik\\Roopik.exe'

export async function runCanvasCreationEval(workspacePath: string) {
	console.log('📝 Running Canvas Creation Eval...')

	const prompt = 'Create a new canvas called "Login Page" for designing a login screen.'

	// Get API key from environment
	const geminiApiKey = process.env.GEMINI_API_KEY
	const openRouterApiKey = process.env.OPENROUTER_API_KEY

	// Prefer Gemini if available, fallback to OpenRouter
	const settings = geminiApiKey ? {
		apiProvider: 'gemini',
		geminiApiKey: geminiApiKey,
		geminiModelId: 'gemini-2.0-flash-exp',
	} : openRouterApiKey ? {
		apiProvider: 'openrouter',
		openRouterApiKey: openRouterApiKey,
		openRouterModelId: 'google/gemini-2.0-flash-exp:free',
	} : {
		// Fallback - will fail but show clear error
		apiProvider: 'gemini',
		geminiModelId: 'gemini-2.0-flash-exp',
	}

	console.log(`🔑 Using API provider: ${settings.apiProvider}`)

	const result = await runEvalWithIpc({
		roopikPath: ROOPIK_PATH,
		workspacePath,
		prompt,
		timeout: 2, // 2 minutes
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
