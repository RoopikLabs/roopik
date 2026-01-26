/**
 * Roopik Evals - Public API
 *
 * Clean, modular evaluation framework for AI coding agents
 */

// Configuration
export * from './config/agent-config.js'
export * from './config/eval-config.js'

// Core runner
export * from './ipc-runner.js'

// Evals
export * from './evals/canvas-creation-ipc.js'

// Types
export type { RunEvalOptions, EvalResult } from './ipc-runner.js'
