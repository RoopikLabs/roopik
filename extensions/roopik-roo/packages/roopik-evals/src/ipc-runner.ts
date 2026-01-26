/**
 * Roopik Eval Runner using IPC
 * Based on Roo Code's runTask.ts approach
 */

import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import { spawn } from 'child_process'
import pWaitFor from 'p-wait-for'
import { IpcClient } from '@roo-code/ipc'
import {
	TaskCommandName,
	RooCodeEventName,
	IpcMessageType,
	type TaskEvent
} from '@roo-code/types'
import { EventRecorder } from './core/recorder.js'

export interface RunEvalOptions {
	roopikPath: string
	workspacePath: string
	prompt: string
	timeout?: number // in minutes
	settings?: any
	recorder?: EventRecorder  // Optional recorder
	expectedTools?: string[]  // For metrics calculation
}

export interface EvalResult {
	success: boolean
	taskId?: string
	duration: number
	error?: string
	events: TaskEvent[]
}

export async function runEvalWithIpc(options: RunEvalOptions): Promise<EvalResult> {
	const {
		roopikPath,
		workspacePath,
		prompt,
		timeout = 5, // 5 minutes default
		settings = {},
		recorder,
		expectedTools = []
	} = options

	const ipcSocketPath = path.resolve(os.tmpdir(), `roopik-eval-${Date.now()}.sock`)
	const startTime = Date.now()
	const events: TaskEvent[] = []

	console.log('🔌 IPC Socket:', ipcSocketPath)
	console.log('📂 Workspace:', workspacePath)
	console.log('📝 Prompt:', prompt.substring(0, 100) + '...')

	// Spawn Roopik with IPC socket
	const userDataDir = path.join(workspacePath, '.user-data')
	const extensionsDir = path.join(workspacePath, '.extensions')

	const roopikProcess = spawn(roopikPath, [
		workspacePath,
		'--skip-welcome',
		'--skip-release-notes',
		'--disable-workspace-trust',
		`--user-data-dir=${userDataDir}`,
		`--extensions-dir=${extensionsDir}`,
	], {
		env: {
			...process.env,
			ROO_CODE_IPC_SOCKET_PATH: ipcSocketPath,
		},
		stdio: 'ignore',
		// Don't use detached on Windows - causes issues with cleanup
		detached: process.platform !== 'win32',
	})

	// Give Roopik time to start
	console.log('⏳ Waiting for Roopik to start...')
	await new Promise(resolve => setTimeout(resolve, 5000))

	// Connect to IPC socket
	console.log('🔌 Connecting to IPC socket...')

	// Create client - this starts connection automatically
	const client = new IpcClient(ipcSocketPath)

	// Wait for connection
	try {
		await pWaitFor(() => client.isReady, {
			interval: 500,
			timeout: 30000 // 30 seconds wait for connection
		})
		console.log('✅ Connected to IPC socket!')
	} catch (e) {
		console.error('❌ Failed to connect to IPC socket')
		console.log(`Debug: isConnected=${client.isConnected}, clientId=${client.clientId}`)
		cleanup()
		throw new Error('Failed to connect to IPC socket')
	}

	// Track task state
	let taskId: string | undefined
	let taskStarted = false
	let taskFinished = false
	let taskAborted = false
	let isClientDisconnected = false

	// Listen for task events
	// Note: We access the internal emitter or use proper type casting if needed
	// The IpcClient extends EventEmitter
	client.on(IpcMessageType.TaskEvent, (taskEvent: TaskEvent) => {
		const { eventName, payload } = taskEvent
		events.push(taskEvent)

		// Record event if recorder is provided
		if (recorder) {
			recorder.recordTaskEvent(taskEvent)
		}

		console.log(`📡 Event: ${eventName}`, payload)

		if (eventName === RooCodeEventName.TaskStarted) {
			taskStarted = true
			taskId = payload[0]
			console.log(`🚀 Task started: ${taskId}`)
		}

		if (eventName === RooCodeEventName.TaskCompleted) {
			taskFinished = true
			console.log('✅ Task completed!')
		}

		if (eventName === RooCodeEventName.TaskAborted) {
			taskAborted = true
			console.log('❌ Task aborted!')
		}
	})

	// Handle disconnection
	// @ts-ignore - Check if Disconnect is the right enum
	client.on(IpcMessageType.Disconnect || 'disconnect', () => {
		console.log('[client#onDisconnect]')
		console.log('🔌 IPC disconnected')
		isClientDisconnected = true
	})

	// Handle connection
	// @ts-ignore - Check if Connect is the right enum
	client.on(IpcMessageType.Connect || 'connect', () => {
		console.log('[client#onConnect]')
	})

	// Start the task
	console.log('🚀 Starting task...')
	console.log('📋 Config:', JSON.stringify({
		apiProvider: settings.apiProvider,
		apiModelId: settings.apiModelId,
		openRouterModelId: settings.openRouterModelId,
	}, null, 2))

	client.sendCommand({
		commandName: TaskCommandName.StartNewTask,
		data: {
			configuration: settings,
			text: prompt,
		},
	})

	// Wait for task to start
	try {
		await pWaitFor(() => taskStarted || isClientDisconnected, {
			interval: 100,
			timeout: 60000, // 60 seconds
		})
	} catch (e) {
		if (!taskStarted) {
			console.error('❌ Task failed to start within timeout')
			cleanup()
			throw new Error('Task failed to start within timeout')
		}
	}

	if (isClientDisconnected && !taskStarted) {
		cleanup()
		throw new Error('Client disconnected before task started')
	}

	// Wait for task to complete or timeout
	const timeoutMs = timeout * 60 * 1000
	try {
		await pWaitFor(
			() => taskFinished || taskAborted || isClientDisconnected,
			{
				interval: 100,
				timeout: timeoutMs,
			}
		)
	} catch (error) {
		console.log('⏰ Task timeout reached')
		// Try to cancel the task
		if (taskId) {
			console.log('🔒 Closing task...')
			client.sendCommand({
				commandName: TaskCommandName.CloseTask,
				data: { id: taskId },
			})
		}
	}

	// Close task if still running
	if (taskId && !taskFinished && !taskAborted) {
		console.log('🔒 Closing task...')
		client.sendCommand({
			commandName: TaskCommandName.CloseTask,
			data: { id: taskId },
		})
		await new Promise(resolve => setTimeout(resolve, 1000))
	}

	// Clean up function
	function cleanup() {
		if (client) {
			client.disconnect()
		}

		// Kill Roopik process
		console.log('🛑 Killing Roopik process...')
		try {
			if (process.platform === 'win32') {
				// Windows: Use taskkill to force kill the process tree
				const { execSync } = require('child_process')
				try {
					execSync(`taskkill /pid ${roopikProcess.pid} /T /F`, { stdio: 'ignore' })
				} catch (killError: any) {
					// Ignore errors
				}
			} else {
				// Unix: Kill process group
				process.kill(-roopikProcess.pid!, 'SIGTERM')
			}
		} catch (error) {
			// Ignore cleanup errors
		}
	}

	cleanup()

	const duration = Date.now() - startTime

	return {
		success: taskFinished && !taskAborted,
		taskId,
		duration,
		error: taskAborted ? 'Task was aborted' : undefined,
		events,
	}
}
