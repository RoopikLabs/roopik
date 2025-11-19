/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Vite Dev Server Worker (Child Process)
 * Modular plugin-based architecture for framework-agnostic preview
 */

const { createServer } = require('vite');
const path = require('path');
const { createRoopikInjectPlugin } = require('./plugins/roopikInjectPlugin');
const { createAuthMiddleware } = require('./plugins/authMiddleware');
const { getSourcePlugin, supportsClickToSource } = require('./plugins/pluginFactory');
const { detectFramework, getFrameworkDisplayName } = require('./frameworkDetector');

/**
 * Get extension's node_modules path
 * Worker runs in user's project, but we need OUR dependencies (Babel, etc.)
 */
function getExtensionNodeModules() {
	// __dirname = /extension/out/devServer
	// We need: /extension/node_modules
	return path.join(__dirname, '..', '..', 'node_modules');
}

/**
 * Start Vite server with Roopik plugins
 * Uses plugin factory to select appropriate source tracking plugin
 */
async function startViteServer(config) {
	const { root, port, framework } = config;

	console.log('[Roopik Worker] Starting Vite server...');
	console.log('[Roopik Worker] Root:', root);
	console.log('[Roopik Worker] Port:', port);
	console.log('[Roopik Worker] Framework:', getFrameworkDisplayName(framework));
	console.log('[Roopik Worker] Extension node_modules:', getExtensionNodeModules());

	// Get framework-specific source plugin
	const extensionNodeModules = getExtensionNodeModules();
	const sourcePlugin = getSourcePlugin(framework, extensionNodeModules);

	// Check if click-to-source is supported
	const hasClickToSource = supportsClickToSource(framework);
	console.log('[Roopik Worker] Click-to-source support:', hasClickToSource ? '✓ Enabled' : '✗ Not available');

	// Load user's vite.config.js (if exists)
	const configPath = path.join(root, 'vite.config.js');

	// Create Vite server with programmatic API
	const server = await createServer({
		root: root,
		configFile: configPath,
		server: {
			port: port,
			host: '127.0.0.1',
			strictPort: false,
			cors: {
				origin: true, // Allow all origins (safe because of auth middleware)
				credentials: true
			}
		},
		plugins: [
			// 1. Authentication plugin (MUST run via configureServer to be in correct middleware position)
			{
				name: 'roopik-auth',
				configureServer(server) {
					// Insert middleware at the BEGINNING of the chain (before Vite's serve middleware)
					return () => {
						// Add CORS middleware
						server.middlewares.use((req, res, next) => {
							res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
							res.setHeader('Access-Control-Allow-Credentials', 'true');
							res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
							res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Roopik-Auth');

							if (req.method === 'OPTIONS') {
								res.statusCode = 200;
								res.end();
								return;
							}
							next();
						});

						// Add authentication middleware
						server.middlewares.use(createAuthMiddleware());
					};
				}
			},

			// 2. Framework-specific source tracking plugin (React, Vue, etc.)
			sourcePlugin,

			// 3. HTML injection plugin (universal - works for all frameworks)
			createRoopikInjectPlugin()
		]
	});

	// Start server
	await server.listen();

	const actualPort = server.config.server.port;
	const url = `http://127.0.0.1:${actualPort}`;

	console.log('[Roopik Worker] ✓ Server started:', url);

	return { url, port: actualPort };
}

/**
 * Handle IPC messages from parent extension
 */
process.on('message', async (message) => {
	if (message.type === 'START') {
		try {
			const { root, port, framework: frameworkHint } = message.payload;

			// Detect framework from package.json (more accurate than the hint)
			const detectedFramework = detectFramework(root);
			const framework = detectedFramework !== 'unknown' ? detectedFramework : frameworkHint;

			console.log('[Roopik Worker] Framework hint:', frameworkHint);
			console.log('[Roopik Worker] Detected framework:', detectedFramework);
			console.log('[Roopik Worker] Using framework:', framework);

			let result;

			// All Vite-based frameworks use the same server
			if (framework.includes('-vite') || framework === 'vite') {
				result = await startViteServer({ root, port, framework });
			} else {
				throw new Error(`Unsupported framework: ${framework}. Currently only Vite-based projects are supported.`);
			}

			// Notify parent extension
			process.send({
				type: 'READY',
				url: result.url,
				port: result.port
			});

		} catch (error) {
			console.error('[Roopik Worker] ✗ Failed to start server:', error);
			process.send({
				type: 'ERROR',
				message: error.message,
				stack: error.stack
			});
		}
	} else if (message.type === 'STOP') {
		console.log('[Roopik Worker] Stopping server...');
		process.exit(0);
	}
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
	console.error('[Roopik Worker] Uncaught exception:', error);
	process.send({
		type: 'ERROR',
		message: error.message,
		stack: error.stack
	});
});

console.log('[Roopik Worker] Ready and waiting for START message...');
