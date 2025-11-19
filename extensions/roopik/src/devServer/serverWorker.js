/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Vite Dev Server Worker (Child Process)
 */

const { createServer } = require('vite');
const path = require('path');
const { createRoopikInjectPlugin } = require('./plugins/roopikInjectPlugin');
const { createAuthMiddleware } = require('./plugins/authMiddleware');

/**
 * Get extension's node_modules path
 * Worker runs in user's project, but we need OUR Babel installation
 */
function getExtensionNodeModules() {
	// __dirname = /extension/out/devServer
	// We need: /extension/node_modules
	return path.join(__dirname, '..', '..', 'node_modules');
}

/**
 * Babel-based source attribute injection
 * Uses extension's Babel installation (not user's)
 */
function createBabelSourcePlugin() {
	return {
		name: 'roopik-babel-source',
		enforce: 'pre', // Run BEFORE @vitejs/plugin-react
		transform(code, id) {
			// Only process JSX/TSX files
			if (!/\.[jt]sx$/.test(id)) {
				return null;
			}

			try {
				// Load Babel from EXTENSION's node_modules (not user's!)
				const extensionNodeModules = getExtensionNodeModules();
				const babelPath = path.join(extensionNodeModules, '@babel', 'core');
				const babel = require(babelPath);

				// Transform with Babel
				const result = babel.transformSync(code, {
					filename: id,
					plugins: [
						// Babel plugin (inline, no external dependency)
						function roopikBabelPlugin({ types: t }) {
							return {
								visitor: {
									JSXOpeningElement(path, state) {
										const { node } = path;
										const loc = node.loc;
										if (!loc) return;

										const filename = state.filename || id;
										const relPath = filename.replace(/\\/g, '/');
										const sourceValue = `${relPath}:${loc.start.line}:${loc.start.column}`;

										const sourceAttr = t.jsxAttribute(
											t.jsxIdentifier('data-roopik-source'),
											t.stringLiteral(sourceValue)
										);

										const hasRoopikAttr = node.attributes.some(
											attr => t.isJSXAttribute(attr) && attr.name.name === 'data-roopik-source'
										);

										if (!hasRoopikAttr) {
											node.attributes.push(sourceAttr);
										}
									}
								}
							};
						}
					],
					parserOpts: {
						plugins: ['jsx', 'typescript']
					}
				});

				return result ? { code: result.code, map: result.map } : null;
			} catch (error) {
				// Fallback to regex if Babel fails
				console.warn('[Roopik] Babel transform failed, using regex fallback:', error.message);
				return regexFallbackTransform(code, id);
			}
		}
	};
}

/**
 * Regex fallback (for when Babel fails)
 */
function regexFallbackTransform(code, id) {
	try {
		const lines = code.split('\n');
		const modifiedLines = [];

		for (let i = 0; i < lines.length; i++) {
			let line = lines[i];
			const lineNumber = i + 1;

			// Match JSX opening tags
			const jsxTagRegex = /<([A-Z][a-zA-Z0-9]*|[a-z][a-zA-Z0-9]*)\s*([^/>]*?)>/g;

			line = line.replace(jsxTagRegex, (match, tagName, attributes) => {
				if (attributes.includes('data-roopik-source')) {
					return match;
				}

				const columnNumber = lines[i].indexOf('<' + tagName);
				const sourceAttr = ` data-roopik-source="${id}:${lineNumber}:${columnNumber}"`;

				return `<${tagName}${sourceAttr} ${attributes}>`;
			});

			modifiedLines.push(line);
		}

		const modifiedCode = modifiedLines.join('\n');

		if (modifiedCode !== code) {
			return { code: modifiedCode, map: null };
		}

		return null;
	} catch (error) {
		console.error('[Roopik] Regex fallback error:', error);
		return null;
	}
}

/**
 * Start Vite server with Roopik plugins
 */
async function startViteServer(config) {
	const { root, port, authToken } = config;

	console.log('[Roopik Worker] Starting Vite server...');
	console.log('[Roopik Worker] Root:', root);
	console.log('[Roopik Worker] Port:', port);
	console.log('[Roopik Worker] Extension node_modules:', getExtensionNodeModules());

	// Load user's vite.config.js (if exists)
	const configPath = path.join(root, 'vite.config.js');

	// Create Vite server with programmatic API
	const server = await createServer({
		root: root,
		configFile: configPath,
		server: {
			port: port,
			host: '127.0.0.1',
			strictPort: false
		},
		plugins: [
			// Babel-based source injection (with regex fallback)
			createBabelSourcePlugin(),

			// HTML injection plugin
			createRoopikInjectPlugin()
		]
	});

	// Inject authentication middleware
	server.middlewares.use(createAuthMiddleware(authToken));

	// Start server
	await server.listen();

	const actualPort = server.config.server.port;
	const url = `http://127.0.0.1:${actualPort}?token=${authToken}`;

	console.log('[Roopik Worker] ✓ Server started:', url);

	return { url, port: actualPort };
}

/**
 * Handle IPC messages from parent extension
 */
process.on('message', async (message) => {
	if (message.type === 'START') {
		try {
			const { root, port, authToken, framework } = message.payload;

			let result;

			if (framework === 'vite') {
				result = await startViteServer({ root, port, authToken });
			} else {
				throw new Error(`Unsupported framework: ${framework}`);
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
