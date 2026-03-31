/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Vite Runner Module
 *
 * Manages Vite server lifecycle:
 * - Load Vite from user's project
 * - Configure with Roopik plugins
 * - Start/stop server
 * - Handle errors gracefully
 *
 * Design:
 * - Stateless functions (server state managed by caller)
 * - Clear error messages for common issues
 * - Supports user's vite.config files
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
import { getPluginsForFramework } from './plugins.mjs';

// Create require for loading user's Vite
const require = createRequire(import.meta.url);

// ============================================
// Configuration
// ============================================

/**
 * Find vite.config file in project
 * @param {string} projectRoot - Project root directory
 * @returns {string|false} Config path or false if not found
 */
export function findViteConfig(projectRoot) {
	const configs = [
		'vite.config.js',
		'vite.config.ts',
		'vite.config.mjs',
		'vite.config.cjs',
		'vite.config.mts',
		'vite.config.cts'
	];

	for (const config of configs) {
		const configPath = join(projectRoot, config);
		if (existsSync(configPath)) {
			return configPath;
		}
	}

	return false;
}

/**
 * Load Vite's createServer function from user's project
 * @param {string} projectRoot - Project root directory
 * @returns {{ createServer: Function, version: string }}
 */
export function loadVite(projectRoot) {
	const vitePath = join(projectRoot, 'node_modules', 'vite');

	try {
		const vite = require(vitePath);

		if (typeof vite.createServer !== 'function') {
			throw new Error('Vite module loaded but createServer is not a function');
		}

		// Get version
		let version = 'unknown';
		try {
			const vitePkg = require(join(vitePath, 'package.json'));
			version = vitePkg.version;
		} catch {
			// Ignore version read errors
		}

		return {
			createServer: vite.createServer,
			version
		};
	} catch (error) {
		if (error.code === 'MODULE_NOT_FOUND') {
			throw new Error('Vite is not installed. Run "npm install vite" first.');
		}
		throw new Error(`Failed to load Vite: ${error.message}`);
	}
}

// ============================================
// Server Management
// ============================================

/**
 * @typedef {Object} ServerConfig
 * @property {string} projectRoot - Project root directory
 * @property {number} port - Preferred port (may change if taken)
 * @property {string} frameworkId - Framework identifier
 * @property {Object} [pluginOptions] - Options for Roopik plugins
 */

/**
 * @typedef {Object} ServerResult
 * @property {Object} server - Vite dev server instance
 * @property {string} url - Server URL
 * @property {number} port - Actual port used
 */

/**
 * Start Vite dev server
 * @param {ServerConfig} config - Server configuration
 * @returns {Promise<ServerResult>}
 */
export async function startServer(config) {
	const { projectRoot, port, frameworkId, pluginOptions = {} } = config;

	// Load Vite
	const { createServer, version } = loadVite(projectRoot);
	console.log(`│  Vite v${version} loaded`);

	// Find user's config file
	const configFile = findViteConfig(projectRoot);
	if (configFile) {
		const configName = configFile.split(/[/\\]/).pop();
		console.log(`│  Config: ${configName}`);
	} else {
		console.log('│  Config: (using defaults)');
	}

	// Get Roopik plugins
	const roopikPlugins = getPluginsForFramework(frameworkId, pluginOptions);
	console.log(`│  Plugins: ${roopikPlugins.length} loaded`);

	// Create server configuration
	const serverConfig = {
		root: projectRoot,
		configFile: configFile,
		server: {
			port: port,
			host: '127.0.0.1',
			strictPort: false, // Allow Vite to find next available port
			cors: true,
			hmr: {
				// Use same host for HMR WebSocket
				host: '127.0.0.1'
			}
		},
		plugins: roopikPlugins,
		// Clear screen disabled for better log readability
		clearScreen: false,
		// Optimize deps settings
		optimizeDeps: {
			// Force optimization in dev
			force: false
		},
		// Logging
		logLevel: 'info'
	};

	try {
		// Create and start server
		const server = await createServer(serverConfig);
		await server.listen();

		// Get actual port (may differ if original was taken)
		const actualPort = server.config.server.port;
		const url = `http://127.0.0.1:${actualPort}`;

		console.log(`[ViteRunner] ✓ Server started: ${url}`);

		return {
			server,
			url,
			port: actualPort
		};
	} catch (error) {
		// Provide helpful error messages
		if (error.message.includes('EADDRINUSE')) {
			throw new Error(`Port ${port} is already in use. Try a different port.`);
		}
		if (error.message.includes('EACCES')) {
			throw new Error(`Permission denied for port ${port}. Try a port above 1024.`);
		}
		throw new Error(`Failed to start Vite server: ${error.message}`);
	}
}

/**
 * Stop Vite dev server gracefully
 * @param {Object} server - Vite server instance
 * @returns {Promise<void>}
 */
export async function stopServer(server) {
	if (!server) {
		return;
	}

	try {
		console.log('[ViteRunner] Stopping server...');
		await server.close();
		console.log('[ViteRunner] ✓ Server stopped');
	} catch (error) {
		console.error('[ViteRunner] Error stopping server:', error.message);
		// Don't rethrow - best effort shutdown
	}
}

/**
 * Restart Vite dev server
 * @param {Object} server - Current server instance
 * @param {ServerConfig} config - Server configuration
 * @returns {Promise<ServerResult>}
 */
export async function restartServer(server, config) {
	await stopServer(server);
	return startServer(config);
}
