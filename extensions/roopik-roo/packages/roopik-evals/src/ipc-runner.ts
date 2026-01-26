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

export interface RunEvalOptions {
	roopikPath: string
	workspacePath: string
	prompt: string
	timeout?: number // in minutes
	settings?: any
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
		settings = {}
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

	// Don't unref - we want to track the process for cleanup
	// roopikProcess.unref()

	// Give Roopik time to start
	console.log('⏳ Waiting for Roopik to start...')
	await new Promise(resolve => setTimeout(resolve, 5000))

	// Connect to IPC socket
	let client: IpcClient | undefined
	let attempts = 10

	console.log('🔌 Connecting to IPC socket...')
	while (attempts > 0) {
		try {
			client = new IpcClient(ipcSocketPath)
			await pWaitFor(() => client!.isReady, { interval: 250, timeout: 2000 })
			console.log('✅ Connected to IPC socket!')
			break
		} catch (error) {
			client?.disconnect()
			attempts--
			if (attempts <= 0) {
				throw new Error(`Failed to connect to IPC socket: ${ipcSocketPath}`)
			}
			console.log(`⏳ Retrying connection... (${attempts} attempts left)`)
			await new Promise(resolve => setTimeout(resolve, 1000))
		}
	}

	if (!client) {
		throw new Error('Failed to create IPC client')
	}

	// Track task state
	let taskId: string | undefined
	let taskStarted = false
	let taskFinished = false
	let taskAborted = false
	let isClientDisconnected = false

	// Listen for task events
	client.on(IpcMessageType.TaskEvent, (taskEvent: TaskEvent) => {
		const { eventName, payload } = taskEvent
		events.push(taskEvent)

		console.log(`📡 Event: ${eventName}`, payload)

		if (eventName === RooCodeEventName.TaskStarted) {
			taskStarted = true
			taskId = payload[0]
			console.log(`🚀 Task started: ${taskId}`)
		}

		if (eventName === RooCodeEventName.TaskCompleted) {
			taskFinished = true
			console.log(`✅ Task completed!`)
		}

		if (eventName === RooCodeEventName.TaskAborted) {
			taskAborted = true
			console.log(`❌ Task aborted!`)
		}
	})

	client.on(IpcMessageType.Disconnect, () => {
		console.log('🔌 IPC disconnected')
		isClientDisconnected = true
	})

	// Start the task
	console.log('🚀 Starting task...')
	client.sendCommand({
		commandName: TaskCommandName.StartNewTask,
		data: {
			configuration: settings,
			text: prompt,
		},
	})

	// Wait for task completion
	const timeoutMs = timeout * 60 * 1000
	try {
		await pWaitFor(
			() => taskFinished || taskAborted || isClientDisconnected,
			{ interval: 1000, timeout: timeoutMs }
		)
	} catch (error) {
		console.log('⏱️  Task timeout reached')
		if (taskId && !isClientDisconnected) {
			console.log('🛑 Cancelling task...')
			client.sendCommand({ commandName: TaskCommandName.CancelTask, data: taskId })
			await new Promise(resolve => setTimeout(resolve, 2000))
		}
	}

	// Close task
	if (taskId && !isClientDisconnected) {
		console.log('🔒 Closing task...')
		client.sendCommand({ commandName: TaskCommandName.CloseTask, data: taskId })
		await new Promise(resolve => setTimeout(resolve, 2000))
	}

	// Disconnect
	if (!isClientDisconnected) {
		console.log('🔌 Disconnecting client...')
		client.disconnect()
	}

	// Kill Roopik process
	console.log('🛑 Killing Roopik process...')
	try {
		if (process.platform === 'win32') {
			// Windows: Use taskkill to force kill the process tree
			const { execSync } = await import('child_process')
			execSync(`taskkill /pid ${roopikProcess.pid} /T /F`, { stdio: 'ignore' })
		} else {
			// Unix: Kill process group
			process.kill(-roopikProcess.pid!, 'SIGTERM')
		}
		// Wait a bit for process to die
		await new Promise(resolve => setTimeout(resolve, 1000))
	} catch (error: any) {
		// ESRCH means process already dead - that's fine
		if (error.code !== 'ESRCH' && error.errno !== -4058) {
			console.log('⚠️  Failed to kill process:', error.message)
		}
	}

	const duration = Date.now() - startTime

	return {
		success: taskFinished && !taskAborted,
		taskId,
		duration,
		error: taskAborted ? 'Task was aborted' : undefined,
		events,
	}
}
