/**
 * Utility functions for eval tests
 */

/**
 * Wait for a condition to become true
 * @param condition - Function that returns boolean or Promise<boolean>
 * @param timeout - Maximum time to wait in milliseconds (default: 10000)
 * @param interval - Check interval in milliseconds (default: 100)
 */
export async function waitFor(
	condition: () => boolean | Promise<boolean>,
	timeout: number = 10000,
	interval: number = 100
): Promise<void> {
	const startTime = Date.now()

	while (Date.now() - startTime < timeout) {
		const result = await Promise.resolve(condition())
		if (result) {
			return
		}
		await sleep(interval)
	}

	throw new Error(`Timeout waiting for condition after ${timeout}ms`)
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Format duration in milliseconds to human readable string
 */
export function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${ms}ms`
	}
	if (ms < 60000) {
		return `${(ms / 1000).toFixed(2)}s`
	}
	const minutes = Math.floor(ms / 60000)
	const seconds = ((ms % 60000) / 1000).toFixed(0)
	return `${minutes}m ${seconds}s`
}

/**
 * Simple assert function for tests
 */
export function assert(condition: boolean, message?: string): asserts condition {
	if (!condition) {
		throw new Error(message || 'Assertion failed')
	}
}

/**
 * Assert that two values are equal
 */
export function assertEqual<T>(actual: T, expected: T, message?: string): void {
	if (actual !== expected) {
		throw new Error(
			message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
		)
	}
}

/**
 * Assert that value is truthy
 */
export function assertExists<T>(value: T | null | undefined, message?: string): asserts value is T {
	if (value == null) {
		throw new Error(message || 'Expected value to exist')
	}
}
