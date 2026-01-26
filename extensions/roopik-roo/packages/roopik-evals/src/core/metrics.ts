/**
 * Metrics Analyzer
 *
 * Analyzes recorded events to calculate performance metrics
 */

import { TaskEvent, RooCodeEventName } from '@roo-code/types'
import { RecordedEvent } from './recorder'

export interface ToolCall {
	tool: string
	timestamp: string
	sequence: number
	success: boolean
}

export interface EvalMetrics {
	// Success metrics
	success: boolean
	taskCompletionTimeMs: number
	error?: string

	// Tool metrics
	expectedTools: string[]
	actualTools: string[]
	toolPrecision: number
	toolRecall: number
	toolF1Score: number

	// Efficiency
	totalToolCalls: number
	unnecessaryActions: number
	retries: number

	// Cost
	tokensIn: number
	tokensOut: number
	cacheHits: number
	costUsd: number

	// Quality (set by verification)
	outputCorrect: boolean
	completenessScore: number
	missingElements: number
}

export class MetricsAnalyzer {
	/**
	 * Extract tool calls from events
	 */
	static extractToolCalls(events: RecordedEvent[]): ToolCall[] {
		const toolCalls: ToolCall[] = []
		let sequence = 0

		for (const event of events) {
			if (event.type === 'task_event') {
				const taskEvent = event.data as TaskEvent

				// Check if this is a tool call message
				if (taskEvent.eventName === RooCodeEventName.Message) {
					const payload = taskEvent.payload as any[]
					const message = payload[0]?.message

					if (message?.say === 'tool' || message?.ask === 'tool') {
						try {
							const toolData = JSON.parse(message.text)
							if (toolData.tool) {
								toolCalls.push({
									tool: toolData.tool,
									timestamp: event.timestamp,
									sequence: sequence++,
									success: true, // Assume success unless we see error
								})
							}
						} catch (e) {
							// Not a tool call
						}
					}
				}
			}
		}

		return toolCalls
	}

	/**
	 * Extract token usage from events
	 */
	static extractTokenUsage(events: RecordedEvent[]): {
		tokensIn: number
		tokensOut: number
		cacheHits: number
		cost: number
	} {
		let tokensIn = 0
		let tokensOut = 0
		let cacheHits = 0
		let cost = 0

		for (const event of events) {
			if (event.type === 'task_event') {
				const taskEvent = event.data as TaskEvent

				if (taskEvent.eventName === 'taskTokenUsageUpdated') {
					const usage = taskEvent.payload[1] as any
					tokensIn = usage.totalTokensIn || 0
					tokensOut = usage.totalTokensOut || 0
					cacheHits = usage.totalCacheReads || 0
					cost = usage.totalCost || 0
				}
			}
		}

		return { tokensIn, tokensOut, cacheHits, cost }
	}

	/**
	 * Calculate tool metrics (precision, recall, F1)
	 */
	static calculateToolMetrics(
		expectedTools: string[],
		actualTools: string[]
	): {
		precision: number
		recall: number
		f1Score: number
	} {
		// Find tools that were both expected and called
		const correctTools = actualTools.filter(t => expectedTools.includes(t))

		// Precision: Of all tools called, how many were correct?
		const precision = actualTools.length > 0
			? correctTools.length / actualTools.length
			: 0

		// Recall: Of all expected tools, how many were called?
		const recall = expectedTools.length > 0
			? correctTools.length / expectedTools.length
			: 0

		// F1 Score: Harmonic mean of precision and recall
		const f1Score = (precision + recall) > 0
			? 2 * (precision * recall) / (precision + recall)
			: 0

		return { precision, recall, f1Score }
	}

	/**
	 * Detect unnecessary actions
	 */
	static detectUnnecessaryActions(
		toolCalls: ToolCall[],
		expectedTools: string[]
	): number {
		// Count tool calls that weren't in the expected list
		return toolCalls.filter(tc => !expectedTools.includes(tc.tool)).length
	}

	/**
	 * Count retries (same tool called multiple times)
	 */
	static countRetries(toolCalls: ToolCall[]): number {
		const toolCounts = new Map<string, number>()

		for (const tc of toolCalls) {
			toolCounts.set(tc.tool, (toolCounts.get(tc.tool) || 0) + 1)
		}

		// Sum up retries (count - 1 for each tool)
		let retries = 0
		for (const count of toolCounts.values()) {
			if (count > 1) {
				retries += count - 1
			}
		}

		return retries
	}

	/**
	 * Analyze all events and calculate metrics
	 */
	static analyze(
		events: RecordedEvent[],
		expectedTools: string[],
		startTime: number,
		endTime: number,
		success: boolean,
		error?: string
	): Partial<EvalMetrics> {
		// Extract data from events
		const toolCalls = this.extractToolCalls(events)
		const actualTools = [...new Set(toolCalls.map(tc => tc.tool))] // Unique tools
		const tokenUsage = this.extractTokenUsage(events)

		// Calculate metrics
		const toolMetrics = this.calculateToolMetrics(expectedTools, actualTools)
		const unnecessaryActions = this.detectUnnecessaryActions(toolCalls, expectedTools)
		const retries = this.countRetries(toolCalls)

		return {
			// Success
			success,
			taskCompletionTimeMs: endTime - startTime,
			error,

			// Tools
			expectedTools,
			actualTools,
			toolPrecision: toolMetrics.precision,
			toolRecall: toolMetrics.recall,
			toolF1Score: toolMetrics.f1Score,

			// Efficiency
			totalToolCalls: toolCalls.length,
			unnecessaryActions,
			retries,

			// Cost
			tokensIn: tokenUsage.tokensIn,
			tokensOut: tokenUsage.tokensOut,
			cacheHits: tokenUsage.cacheHits,
			costUsd: tokenUsage.cost,
		}
	}
}
