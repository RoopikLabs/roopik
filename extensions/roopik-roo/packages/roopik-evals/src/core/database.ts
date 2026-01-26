/**
 * Database Layer
 *
 * Simple JSON-based storage for now (can upgrade to SQLite later)
 */

import * as fs from 'fs'
import * as path from 'path'
import { EvalMetrics } from './metrics'

export interface EvalRun {
	id: string
	evalId: string
	evalName: string
	provider: string
	model: string
	startedAt: string
	completedAt: string
	metrics: EvalMetrics
}

export class Database {
	private dbPath: string
	private runs: EvalRun[] = []

	constructor(dbPath?: string) {
		this.dbPath = dbPath || path.join(process.cwd(), 'results', 'eval_runs.json')
		this.load()
	}

	/**
	 * Load database from disk
	 */
	private load() {
		try {
			if (fs.existsSync(this.dbPath)) {
				const data = fs.readFileSync(this.dbPath, 'utf-8')
				this.runs = JSON.parse(data)
			}
		} catch (error) {
			console.warn('Failed to load database, starting fresh')
			this.runs = []
		}
	}

	/**
	 * Save database to disk
	 */
	private save() {
		const dir = path.dirname(this.dbPath)
		fs.mkdirSync(dir, { recursive: true })
		fs.writeFileSync(this.dbPath, JSON.stringify(this.runs, null, 2))
	}

	/**
	 * Insert a new eval run
	 */
	insertRun(run: EvalRun) {
		this.runs.push(run)
		this.save()
	}

	/**
	 * Get all runs for an eval
	 */
	getRunsForEval(evalId: string): EvalRun[] {
		return this.runs.filter(r => r.evalId === evalId)
	}

	/**
	 * Get runs by provider
	 */
	getRunsByProvider(provider: string): EvalRun[] {
		return this.runs.filter(r => r.provider === provider)
	}

	/**
	 * Get recent runs
	 */
	getRecentRuns(limit: number = 10): EvalRun[] {
		return this.runs
			.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
			.slice(0, limit)
	}

	/**
	 * Calculate success rate for an eval
	 */
	getSuccessRate(evalId: string): number {
		const runs = this.getRunsForEval(evalId)
		if (runs.length === 0) return 0

		const successful = runs.filter(r => r.metrics.success).length
		return successful / runs.length
	}

	/**
	 * Get average metrics for an eval
	 */
	getAverageMetrics(evalId: string): Partial<EvalMetrics> | null {
		const runs = this.getRunsForEval(evalId)
		if (runs.length === 0) return null

		const sum = runs.reduce((acc, run) => ({
			taskCompletionTimeMs: acc.taskCompletionTimeMs + run.metrics.taskCompletionTimeMs,
			totalToolCalls: acc.totalToolCalls + run.metrics.totalToolCalls,
			tokensIn: acc.tokensIn + run.metrics.tokensIn,
			tokensOut: acc.tokensOut + run.metrics.tokensOut,
			costUsd: acc.costUsd + run.metrics.costUsd,
		}), {
			taskCompletionTimeMs: 0,
			totalToolCalls: 0,
			tokensIn: 0,
			tokensOut: 0,
			costUsd: 0,
		})

		const count = runs.length
		return {
			taskCompletionTimeMs: sum.taskCompletionTimeMs / count,
			totalToolCalls: sum.totalToolCalls / count,
			tokensIn: sum.tokensIn / count,
			tokensOut: sum.tokensOut / count,
			costUsd: sum.costUsd / count,
		}
	}

	/**
	 * Compare providers for an eval
	 */
	compareProviders(evalId: string): Map<string, {
		successRate: number
		avgTime: number
		avgCost: number
		runs: number
	}> {
		const runs = this.getRunsForEval(evalId)
		const byProvider = new Map<string, EvalRun[]>()

		// Group by provider
		for (const run of runs) {
			if (!byProvider.has(run.provider)) {
				byProvider.set(run.provider, [])
			}
			byProvider.get(run.provider)!.push(run)
		}

		// Calculate stats for each provider
		const stats = new Map()
		for (const [provider, providerRuns] of byProvider) {
			const successful = providerRuns.filter(r => r.metrics.success).length
			const avgTime = providerRuns.reduce((sum, r) => sum + r.metrics.taskCompletionTimeMs, 0) / providerRuns.length
			const avgCost = providerRuns.reduce((sum, r) => sum + r.metrics.costUsd, 0) / providerRuns.length

			stats.set(provider, {
				successRate: successful / providerRuns.length,
				avgTime,
				avgCost,
				runs: providerRuns.length,
			})
		}

		return stats
	}
}
