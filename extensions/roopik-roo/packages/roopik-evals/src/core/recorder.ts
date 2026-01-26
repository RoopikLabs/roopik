/**
 * Event Recorder
 *
 * Records all eval events to disk for analysis
 */

import * as fs from 'fs'
import * as path from 'path'
import { TaskEvent } from '@roo-code/types'

export interface RecordedEvent {
	timestamp: string
	type: string
	data: any
}

export interface EvalRecording {
	runId: string
	evalId: string
	provider: string
	model: string
	startedAt: string
	events: RecordedEvent[]
}

export class EventRecorder {
	private events: RecordedEvent[] = []
	private runId: string
	private evalId: string
	private provider: string
	private model: string
	private startedAt: string
	private resultsDir: string

	constructor(
		runId: string,
		evalId: string,
		provider: string,
		model: string
	) {
		this.runId = runId
		this.evalId = evalId
		this.provider = provider
		this.model = model
		this.startedAt = new Date().toISOString()

		// Create results directory
		this.resultsDir = path.join(
			process.cwd(),
			'results',
			'runs',
			new Date().toISOString().split('T')[0], // YYYY-MM-DD
			`${evalId}-${provider}-${runId.slice(0, 8)}`
		)

		fs.mkdirSync(this.resultsDir, { recursive: true })
	}

	/**
	 * Record a task event
	 */
	recordTaskEvent(event: TaskEvent) {
		this.events.push({
			timestamp: new Date().toISOString(),
			type: 'task_event',
			data: event,
		})
	}

	/**
	 * Record a custom event
	 */
	recordEvent(type: string, data: any) {
		this.events.push({
			timestamp: new Date().toISOString(),
			type,
			data,
		})
	}

	/**
	 * Save events to disk (JSONL format - one JSON per line)
	 */
	async saveEvents() {
		const eventsFile = path.join(this.resultsDir, 'events.jsonl')

		// Write each event as a separate line
		const lines = this.events.map(e => JSON.stringify(e)).join('\n')
		fs.writeFileSync(eventsFile, lines)

		console.log(`📝 Events saved: ${eventsFile}`)
	}

	/**
	 * Save summary
	 */
	async saveSummary(summary: any) {
		const summaryFile = path.join(this.resultsDir, 'summary.json')
		fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2))

		console.log(`📊 Summary saved: ${summaryFile}`)
	}

	/**
	 * Get recording metadata
	 */
	getMetadata(): EvalRecording {
		return {
			runId: this.runId,
			evalId: this.evalId,
			provider: this.provider,
			model: this.model,
			startedAt: this.startedAt,
			events: this.events,
		}
	}

	/**
	 * Get results directory
	 */
	getResultsDir(): string {
		return this.resultsDir
	}
}
