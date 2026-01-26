/**
 * Core types for Roopik Eval System
 */

/**
 * Result of an eval test
 */
export interface EvalResult {
	name: string
	passed: boolean
	duration: number
	error?: string
	details?: {
		expectedBehavior?: string
		actualBehavior?: string
		verificationSteps?: string[]
		logs?: string[]
	}
}

/**
 * Evaluation test definition
 */
export interface Eval {
	name: string
	description: string

	/**
	 * The prompt to give to the agent
	 */
	prompt: string

	/**
	 * Expected behavior description
	 */
	expectedBehavior: string

	/**
	 * Test execution function
	 * @param context - VSCode extension API context
	 * @returns Promise<EvalResult>
	 */
	execute: (context: EvalContext) => Promise<EvalResult>

	/**
	 * Optional timeout in milliseconds (default: 60000)
	 */
	timeout?: number

	/**
	 * Tags for filtering/categorization
	 */
	tags?: string[]
}

/**
 * Context provided to eval tests during execution
 */
export interface EvalContext {
	/**
	 * Workspace path where test is running
	 */
	workspacePath: string

	/**
	 * VSCode API - available in headless mode
	 */
	vscode: any // Will be actual vscode module when running in extension context

	/**
	 * Helper to wait for condition
	 */
	waitFor: (condition: () => boolean | Promise<boolean>, timeout?: number) => Promise<void>

	/**
	 * Log messages (collected for results)
	 */
	log: (message: string) => void
}

/**
 * Configuration for spawning Roopik IDE
 */
export interface RoopikSpawnConfig {
	/**
	 * Path to Roopik executable
	 */
	roopikPath: string

	/**
	 * Workspace to open
	 */
	workspacePath: string

	/**
	 * Extension test path
	 */
	extensionTestsPath: string

	/**
	 * Additional launch args
	 */
	launchArgs?: string[]

	/**
	 * Disable other extensions (keep only roopik-roo)
	 */
	disableExtensions?: boolean
}

/**
 * Summary of eval run
 */
export interface EvalRunSummary {
	totalTests: number
	passed: number
	failed: number
	duration: number
	results: EvalResult[]
}
