/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Dev Server Worker (ES Module)
 *
 * Child process that runs Vite dev server for project preview.
 *
 * Architecture:
 * - Prerequisites check pipeline (validates project before starting)
 * - Modular plugin system (framework-specific source tracking)
 * - Clean separation of concerns
 *
 * Communication (IPC with parent process):
 * - Receives: START, STOP
 * - Sends: READY (success), ERROR (failure)
 */

import { runAllChecks } from './lib/prerequisites.mjs';
import { startServer, stopServer } from './lib/viteRunner.mjs';
import { supportsSourceTracking } from './lib/plugins.mjs';
import { Logger } from './lib/logger.mjs';

// ============================================
// State
// ============================================

const logger = new Logger('DevServer');
let currentServer = null;
let isShuttingDown = false;

// ============================================
// Pipeline Execution
// ============================================

/**
 * Run full startup pipeline
 * 1. Validate prerequisites
 * 2. Start Vite server
 * 3. Report success or failure
 */
async function runStartupPipeline(config) {
	const { projectRoot, port, pluginConfig = {} } = config;

	// Extract project name from path for cleaner logs
	const projectName = projectRoot.split(/[/\\]/).pop() || projectRoot;

	console.log('');
	console.log('╔══════════════════════════════════════════════════════════╗');
	console.log('║           ROOPIK DEV SERVER - STARTING                   ║');
	console.log('╚══════════════════════════════════════════════════════════╝');
	console.log(`  Project: ${projectName}`);
	console.log(`  Path: ${projectRoot}`);
	console.log(`  Port: ${port}`);
	console.log('');

	// ─────────────────────────────────────────
	// Phase 1: Prerequisites
	// ─────────────────────────────────────────

	console.log('┌─ PHASE 1: Checking Prerequisites ─────────────────────────');

	const prereqResult = runAllChecks(projectRoot);

	// Log each check result with clear status
	for (const check of prereqResult.results.checks) {
		const icon = check.ok ? '✓' : '✗';
		const status = check.ok ? 'OK' : 'FAILED';
		if (check.ok) {
			console.log(`│  ${icon} [${check.name}] ${status}`);
		} else {
			console.log(`│  ${icon} [${check.name}] ${status}: ${check.error}`);
		}
	}

	// Fail fast if prerequisites not met
	if (!prereqResult.ok) {
		console.log('└─────────────────────────────────────────────────────────────');
		console.log('');
		console.log('❌ PREREQUISITES FAILED');

		// Special handling for missing node_modules
		if (prereqResult.needsInstall) {
			throw new Error(`Dependencies not installed. Run: cd "${projectRoot}" && npm install`);
		}

		throw new Error(`Prerequisite failed: ${prereqResult.error}`);
	}

	const { framework } = prereqResult.results;
	console.log('│');
	console.log(`│  Framework: ${framework.name}`);
	console.log(`│  Source tracking: ${supportsSourceTracking(framework.id) ? 'Yes' : 'No'}`);
	console.log('└─ All checks passed ✓ ──────────────────────────────────────');
	console.log('');

	// ─────────────────────────────────────────
	// Phase 2: Start Server
	// ─────────────────────────────────────────

	console.log('┌─ PHASE 2: Starting Vite Server ───────────────────────────');
	console.log('│  Loading Vite from project...');

	const serverResult = await startServer({
		projectRoot,
		port,
		frameworkId: framework.id,
		pluginOptions: {
			verbose: pluginConfig.verboseLogging || false
		}
	});

	currentServer = serverResult.server;

	console.log(`│  Server started on port ${serverResult.port}`);
	console.log('└─────────────────────────────────────────────────────────────');
	console.log('');

	// ─────────────────────────────────────────
	// Success!
	// ─────────────────────────────────────────

	console.log('╔══════════════════════════════════════════════════════════╗');
	console.log(`║  ✅ SERVER READY: ${serverResult.url.padEnd(36)} ║`);
	console.log('╚══════════════════════════════════════════════════════════╝');
	console.log('');

	return {
		url: serverResult.url,
		port: serverResult.port,
		framework: framework.id,
		frameworkName: framework.name
	};
}

// ============================================
// Graceful Shutdown
// ============================================

async function shutdown() {
	if (isShuttingDown) {
		return;
	}
	isShuttingDown = true;

	console.log('');
	console.log('┌─ SHUTTING DOWN ────────────────────────────────────────────');

	if (currentServer) {
		console.log('│  Stopping Vite server...');
		await stopServer(currentServer);
		currentServer = null;
		console.log('│  Server stopped');
	}

	console.log('└─ Goodbye! ─────────────────────────────────────────────────');
	console.log('');
	process.exit(0);
}

// ============================================
// IPC Message Handling
// ============================================

process.on('message', async (message) => {
	if (!message || typeof message.type !== 'string') {
		logger.warn('Received invalid message:', message);
		return;
	}

	switch (message.type) {
		case 'START': {
			try {
				const { root, port, pluginConfig } = message.payload || {};

				if (!root) {
					throw new Error('Missing required parameter: root (project path)');
				}

				const result = await runStartupPipeline({
					projectRoot: root,
					port: port || 5173,
					pluginConfig: pluginConfig || {}
				});

				// Notify parent of success
				process.send({
					type: 'READY',
					url: result.url,
					port: result.port,
					framework: result.framework,
					frameworkName: result.frameworkName
				});

			} catch (error) {
				logger.error(error.message);
				logger.result(false, 'Startup failed');

				// Notify parent of failure
				process.send({
					type: 'ERROR',
					message: error.message,
					stack: error.stack
				});
			}
			break;
		}

		case 'STOP': {
			await shutdown();
			break;
		}

		default: {
			logger.warn(`Unknown message type: ${message.type}`);
		}
	}
});

// ============================================
// Error Handling
// ============================================

process.on('uncaughtException', (error) => {
	logger.error('Uncaught exception:', error.message);
	if (error.stack) {
		console.error(error.stack);
	}

	process.send({
		type: 'ERROR',
		message: error.message,
		stack: error.stack
	});
});

process.on('unhandledRejection', (reason) => {
	const message = reason instanceof Error ? reason.message : String(reason);
	const stack = reason instanceof Error ? reason.stack : undefined;

	logger.error('Unhandled rejection:', message);

	process.send({
		type: 'ERROR',
		message: message,
		stack: stack
	});
});

// Handle SIGTERM/SIGINT for graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ============================================
// Startup
// ============================================

console.log('[DevServer Worker] Started, waiting for commands...');
