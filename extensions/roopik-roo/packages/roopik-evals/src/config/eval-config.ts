/**
 * Evaluation Configuration
 *
 * Central configuration for running evals
 */

/**
 * Default Roopik IDE path
 * Override with ROOPIK_PATH environment variable
 */
export const DEFAULT_ROOPIK_PATH =
	process.env.ROOPIK_PATH ||
	'C:\\Users\\Humblebee\\AppData\\Local\\Programs\\Roopik\\Roopik.exe'

/**
 * Default eval timeout in minutes
 */
export const DEFAULT_EVAL_TIMEOUT = 5

/**
 * Eval configuration interface
 */
export interface EvalConfig {
	roopikPath: string
	provider: string
	timeout: number
	workspacePrefix?: string
}

/**
 * Get eval configuration from environment or defaults
 */
export function getEvalConfig(): EvalConfig {
	return {
		roopikPath: process.env.ROOPIK_PATH || DEFAULT_ROOPIK_PATH,
		provider: process.env.EVAL_PROVIDER || 'auto',
		timeout: parseInt(process.env.EVAL_TIMEOUT || String(DEFAULT_EVAL_TIMEOUT)),
		workspacePrefix: process.env.EVAL_WORKSPACE_PREFIX || 'roopik-eval',
	}
}
