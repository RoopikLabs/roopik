/**
 * Reporting CLI
 *
 * Displays eval results and statistics
 */

import { Database } from '../core/database.js'

async function report() {
	const db = new Database()
	const evalId = 'canvas-create'

	console.log('\n📊 Roopik Eval Report')
	console.log('='.repeat(50))

	// 1. Success Rate
	const successRate = db.getSuccessRate(evalId)
	console.log(`\nEval: ${evalId}`)
	console.log(`Success Rate: ${(successRate * 100).toFixed(1)}%`)

	// 2. Metrics (Success only)
	const metrics = db.getAverageMetrics(evalId)
	if (metrics) {
		console.log('\nAverage Metrics (Successful runs):')
		console.log(`  Duration: ${(metrics.taskCompletionTimeMs! / 1000).toFixed(2)}s`)
		console.log(`  Tool Calls: ${metrics.totalToolCalls!.toFixed(1)}`)
		console.log(`  Tokens In: ${Math.round(metrics.tokensIn!)}`)
		console.log(`  Tokens Out: ${Math.round(metrics.tokensOut!)}`)
		console.log(`  Cost: $${metrics.costUsd!.toFixed(4)}`)
	}

	// 3. Provider Comparison
	const comparison = db.compareProviders(evalId)
	if (comparison.size > 0) {
		console.log('\nProvider Comparison:')
		console.log('┌──────────────┬─────────┬──────────┬──────────┬───────┐')
		console.log('│ Provider     │ Success │ Avg Time │ Avg Cost │ Runs  │')
		console.log('├──────────────┼─────────┼──────────┼──────────┼───────┤')

		for (const [provider, stats] of comparison) {
			const name = provider.padEnd(12)
			const success = ((stats.successRate * 100).toFixed(0) + '%').padStart(7)
			const time = ((stats.avgTime / 1000).toFixed(1) + 's').padStart(8)
			const cost = ('$' + stats.avgCost.toFixed(4)).padStart(8)
			const runs = stats.runs.toString().padStart(5)

			console.log(`│ ${name} │ ${success} │ ${time} │ ${cost} │ ${runs} │`)
		}
		console.log('└──────────────┴─────────┴──────────┴──────────┴───────┘')
	}

	// 4. Recent Runs
	const recent = db.getRecentRuns(5)
	console.log('\nRecent Runs:')
	recent.forEach(run => {
		const icon = run.metrics.success ? '✅' : '❌'
		const date = new Date(run.startedAt).toLocaleTimeString()
		console.log(`${icon} ${date} - ${run.provider} (${run.model}) - ${(run.metrics.taskCompletionTimeMs / 1000).toFixed(1)}s`)
	})
}

report().catch(console.error)
