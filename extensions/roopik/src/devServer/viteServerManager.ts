/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';

/**
 * Manages Vite dev server for Mode 2 preview
 *
 * Responsibilities:
 * - Start Vite dev server from extension
 * - Inject Roopik click-to-source script
 * - Manage server lifecycle
 * - Auto-install dependencies if needed
 */
export class ViteServerManager {
	private static instance: ViteServerManager | undefined;
	private serverProcess: ChildProcess | undefined;
	private serverUrl: string | undefined;
	private projectRoot: string;
	private outputChannel: vscode.OutputChannel;

	private constructor(projectRoot: string) {
		this.projectRoot = projectRoot;
		this.outputChannel = vscode.window.createOutputChannel('Roopik Dev Server');
	}

	public static getInstance(projectRoot: string): ViteServerManager {
		if (!ViteServerManager.instance || ViteServerManager.instance.projectRoot !== projectRoot) {
			ViteServerManager.instance = new ViteServerManager(projectRoot);
		}
		return ViteServerManager.instance;
	}

	/**
	 * Start dev server for the project
	 */
	public async start(): Promise<string> {
		this.outputChannel.show();
		this.outputChannel.appendLine('[Roopik] Starting dev server...');

		// Check if dependencies are installed
		const hasNodeModules = fs.existsSync(path.join(this.projectRoot, 'node_modules'));
		if (!hasNodeModules) {
			this.outputChannel.appendLine('[Roopik] node_modules not found. Installing dependencies...');
			await this.installDependencies();
		}

		// Detect project type
		const projectType = this.detectProjectType();
		this.outputChannel.appendLine(`[Roopik] Detected project type: ${projectType}`);

		// Inject Roopik plugin
		this.injectRoopikPlugin();

		// Start server
		return await this.startServer(projectType);
	}

	/**
	 * Stop the dev server
	 */
	public stop(): void {
		if (this.serverProcess) {
			console.log('[Roopik] Stopping dev server...');

			// Kill the entire process tree
			if (process.platform === 'win32') {
				// Windows: Use taskkill
				try {
					require('child_process').execSync(`taskkill /pid ${this.serverProcess.pid} /T /F`);
					console.log('[Roopik] Server process killed (Windows)');
				} catch (error) {
					console.error('[Roopik] Error killing process:', error);
				}
			} else {
				// macOS/Linux: Kill process group with negative PID
				try {
					// Kill the entire process group
					process.kill(-this.serverProcess.pid!, 'SIGTERM');
					console.log('[Roopik] Server process killed (Unix)');
				} catch (error) {
					// Fallback to regular kill
					this.serverProcess.kill('SIGTERM');
					console.log('[Roopik] Server process killed (fallback)');
				}
			}

			this.serverProcess = undefined;
			this.serverUrl = undefined;
			console.log('[Roopik] Dev server stopped');
		} else {
			console.log('[Roopik] No server process to stop');
		}
	}

	/**
	 * Get current server URL
	 */
	public getUrl(): string | undefined {
		return this.serverUrl;
	}

	/**
	 * Install npm dependencies
	 */
	private async installDependencies(): Promise<void> {
		return new Promise((resolve, reject) => {
			const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
			const install = spawn(npmCmd, ['install'], {
				cwd: this.projectRoot,
				shell: true
			});

			install.stdout?.on('data', (data) => {
				this.outputChannel.append(data.toString());
			});

			install.stderr?.on('data', (data) => {
				this.outputChannel.append(data.toString());
			});

			install.on('close', (code) => {
				if (code === 0) {
					this.outputChannel.appendLine('[Roopik] Dependencies installed successfully');
					resolve();
				} else {
					reject(new Error(`npm install failed with code ${code}`));
				}
			});
		});
	}

	/**
	 * Detect project type (React, Vue, plain HTML, etc.)
	 */
	private detectProjectType(): 'vite-react' | 'vite-vue' | 'vite' | 'plain-html' {
		const packageJsonPath = path.join(this.projectRoot, 'package.json');

		if (!fs.existsSync(packageJsonPath)) {
			return 'plain-html';
		}

		try {
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
			const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

			if (deps['react']) {
				return 'vite-react';
			} else if (deps['vue']) {
				return 'vite-vue';
			} else if (deps['vite']) {
				return 'vite';
			}

			return 'plain-html';
		} catch (error) {
			this.outputChannel.appendLine(`[Roopik] Error reading package.json: ${error}`);
			return 'plain-html';
		}
	}

	/**
	 * Start the appropriate dev server
	 */
	private async startServer(_projectType: string): Promise<string> {
		return new Promise((resolve, reject) => {
			const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

			// Start dev server with force flag to clear cache
			this.serverProcess = spawn(npmCmd, ['run', 'dev', '--', '--force'], {
				cwd: this.projectRoot,
				shell: true,
				detached: process.platform !== 'win32', // Create process group on Unix
				env: {
					...process.env,
					BROWSER: 'none',        // Don't auto-open browser
					PORT: '5173',           // Default Vite port
					FORCE_COLOR: '0',       // Disable ANSI colors
					NO_COLOR: '1'           // Alternative flag to disable colors
				}
			});

			let resolved = false;

			this.serverProcess.stdout?.on('data', (data) => {
				const output = data.toString();
				this.outputChannel.append(output);

				// Strip ANSI color codes for parsing
				const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '');

				// Look for Vite server URL (handles both "Local:" and "➜  Local:")
				const urlMatch = cleanOutput.match(/Local:\s+(https?:\/\/[^\s]+)/);
				if (urlMatch && !resolved) {
					const url = urlMatch[1].trim();
					this.serverUrl = url;
					this.outputChannel.appendLine(`[Roopik] Server started: ${url}`);
					resolved = true;
					resolve(url);
				}
			});

			this.serverProcess.stderr?.on('data', (data) => {
				try {
					this.outputChannel.append(data.toString());
				} catch {
					// Output channel might be disposed, use console instead
					console.error('[Roopik]', data.toString());
				}
			});

			this.serverProcess.on('error', (error) => {
				try {
					this.outputChannel.appendLine(`[Roopik] Server error: ${error.message}`);
				} catch {
					console.error('[Roopik] Server error:', error.message);
				}
				if (!resolved) {
					reject(error);
				}
			});

			this.serverProcess.on('close', (code) => {
				try {
					this.outputChannel.appendLine(`[Roopik] Server stopped with code ${code}`);
				} catch {
					console.log(`[Roopik] Server stopped with code ${code}`);
				}
				this.serverProcess = undefined;
				this.serverUrl = undefined;
			});

			// Timeout after 30 seconds
			setTimeout(() => {
				if (!resolved) {
					reject(new Error('Server start timeout'));
				}
			}, 30000);
		});
	}

	/**
	 * Inject Roopik Babel plugin for adding data-roopik-source attributes
	 */
	private injectRoopikBabelPlugin(): void {
		try {
			const babelPluginPath = path.join(this.projectRoot, 'roopik-babel-plugin.js');

			// Always recreate the Babel plugin file
			if (fs.existsSync(babelPluginPath)) {
				fs.unlinkSync(babelPluginPath);
			}

			this.outputChannel.appendLine('[Roopik] Creating roopik-babel-plugin.js...');
			const babelPluginCode = `
// Roopik Babel Plugin - Adds data-roopik-source attributes to JSX elements
// Auto-generated - DO NOT COMMIT

export default function roopikBabelPlugin({ types: t }) {
	return {
		name: 'babel-plugin-roopik-source',
		visitor: {
			JSXOpeningElement(path, state) {
				const { node } = path;
				const loc = node.loc;
				if (!loc) return;

				// Get file path - use relative path from project root
				const filename = state.filename || state.file.opts.filename || '';
				const relPath = filename.replace(/\\\\/g, '/');

				// Create data-roopik-source attribute with file:line:column
				const sourceValue = \`\${relPath}:\${loc.start.line}:\${loc.start.column}\`;

				// Create JSXAttribute node
				const sourceAttr = t.jsxAttribute(
					t.jsxIdentifier('data-roopik-source'),
					t.stringLiteral(sourceValue)
				);

				// Add attribute to element (only if not already present)
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
`;
			fs.writeFileSync(babelPluginPath, babelPluginCode, 'utf-8');
			this.outputChannel.appendLine('[Roopik] ✓ Created roopik-babel-plugin.js');
		} catch (error) {
			this.outputChannel.appendLine(`[Roopik] Error creating Babel plugin: ${error}`);
		}
	}

	/**
	 * Inject Roopik plugin into project
	 */
	private injectRoopikPlugin(): void {
		try {
			// First, inject the Babel plugin
			this.injectRoopikBabelPlugin();

			const pluginPath = path.join(this.projectRoot, 'roopik-plugin.js');

			// Always recreate the plugin file to ensure latest code
			if (fs.existsSync(pluginPath)) {
				fs.unlinkSync(pluginPath);
				this.outputChannel.appendLine('[Roopik] Removed old roopik-plugin.js');
			}

			this.outputChannel.appendLine('[Roopik] Creating roopik-plugin.js...');
			const pluginCode = `
// Roopik Click-to-Source Plugin (Auto-generated - DO NOT COMMIT)
export default function roopikPlugin() {
	return {
		name: 'roopik-inject',
		transformIndexHtml(html) {
			// Inject Roopik script before closing body tag
			const script = \`
<script type="text/javascript">
// Roopik Click-to-Source Integration

// Override console.log to relay to parent
(function() {
	const originalLog = console.log;
	const originalWarn = console.warn;
	const originalError = console.error;

	function relayLog(level, args) {
		try {
			window.parent.postMessage({
				type: 'roopik-log',
				level: level,
				args: Array.from(args)
			}, '*');
		} catch (e) {
			// Ignore relay errors
		}
	}

	console.log = function(...args) {
		originalLog.apply(console, args);
		relayLog('log', args);
	};

	console.warn = function(...args) {
		originalWarn.apply(console, args);
		relayLog('warn', args);
	};

	console.error = function(...args) {
		originalError.apply(console, args);
		relayLog('error', args);
	};
})();

console.log('[Roopik] ========== SCRIPT TAG EXECUTING ==========');
console.log('[Roopik] window.parent:', window.parent);
console.log('[Roopik] window.parent === window:', window.parent === window);

(function() {
	console.log('[Roopik] Inside IIFE');

	if (window.parent === window) {
		console.log('[Roopik] window.parent === window, exiting');
		return;
	}

	console.log('[Roopik] Click-to-source enabled');

	let debugMode = false;

	// Listen for debug mode toggle from Roopik
	window.addEventListener('message', (event) => {
		const message = event.data;
		if (message.type === 'roopik-toggle-debug') {
			debugMode = message.enabled;
			console.log('[Roopik] Debug mode:', debugMode ? 'ON' : 'OFF');
		}
	});

	// Track URL changes
	let lastUrl = location.href;
	function notifyUrlChange() {
		if (location.href !== lastUrl) {
			lastUrl = location.href;
			window.parent.postMessage({ type: 'roopik-navigate', url: location.href }, '*');
		}
	}
	setInterval(notifyUrlChange, 100);
	window.addEventListener('popstate', notifyUrlChange);
	window.addEventListener('hashchange', notifyUrlChange);

	// Click-to-source listener
	document.addEventListener('click', (event) => {
		console.log('[Roopik] Click detected, debugMode:', debugMode, 'Ctrl/Meta:', event.ctrlKey || event.metaKey);

		if (!debugMode) {
			console.log('[Roopik] Debug mode is OFF, ignoring click');
			return;
		}

		if (!(event.metaKey || event.ctrlKey)) {
			console.log('[Roopik] No Ctrl/Meta key, ignoring click');
			return;
		}

		console.log('[Roopik] Processing click-to-source for element:', event.target);
		event.preventDefault();
		event.stopPropagation();

		const source = findSourceInfo(event.target);
		if (source) {
			console.log('[Roopik] ✓ Found source:', source);
			window.parent.postMessage({
				type: 'roopik-click-to-source',
				file: source.fileName,
				line: source.lineNumber,
				column: source.columnNumber,
				componentName: source.componentName
			}, '*');
			console.log('[Roopik] ✓ Sent message to parent');
		} else {
			console.log('[Roopik] ✗ Could not find source info for element');
		}
	}, true);

	// Find source info from element
	function findSourceInfo(element) {
		try {
			console.log('[Roopik] Finding source for element:', element.tagName, element.className);

			// Check for data attributes first (universal approach)
			if (element.hasAttribute && element.hasAttribute('data-roopik-source')) {
				const sourceData = element.getAttribute('data-roopik-source');
				console.log('[Roopik] Found data-roopik-source:', sourceData);

				// Parse format: "filepath:line:column"
				const parts = sourceData.split(':');
				if (parts.length >= 2) {
					const fileName = parts.slice(0, -2).join(':'); // Handle Windows paths with C:
					const lineNumber = parseInt(parts[parts.length - 2], 10);
					const columnNumber = parseInt(parts[parts.length - 1], 10);

					console.log('[Roopik] Parsed source:', { fileName, lineNumber, columnNumber });
					return {
						fileName,
						lineNumber,
						columnNumber,
						componentName: element.tagName || 'Unknown'
					};
				}

				// Fallback: try JSON parse
				try {
					return JSON.parse(sourceData);
				} catch (e) {
					console.error('[Roopik] Failed to parse data-roopik-source');
				}
			}

			// Try React Fiber
			console.log('[Roopik] Checking React Fiber...');
			const fiberKey = Object.keys(element).find(key =>
				key.startsWith('__reactFiber') || key.startsWith('_reactFiber') || key === '_reactInternalFiber'
			);

			if (fiberKey) {
				console.log('[Roopik] Found React Fiber key:', fiberKey);
				let fiber = element[fiberKey];
				let depth = 0;
				while (fiber && depth < 20) {
					console.log('[Roopik] Checking fiber at depth', depth, ':', fiber.type);
					const source = fiber._debugSource || fiber._source;
					if (source && source.fileName) {
						console.log('[Roopik] ✓ Found React source:', source);
						return {
							fileName: source.fileName,
							lineNumber: source.lineNumber,
							columnNumber: source.columnNumber,
							componentName: getComponentName(fiber)
						};
					}
					fiber = fiber.return;
					depth++;
				}
				console.log('[Roopik] No source found in React Fiber tree');
			} else {
				console.log('[Roopik] No React Fiber found on element');
			}

			// Try Vue
			console.log('[Roopik] Checking Vue...');
			const vueKey = Object.keys(element).find(key => key.startsWith('__vue') || key.startsWith('__vnode'));
			if (vueKey) {
				console.log('[Roopik] Found Vue key:', vueKey);
				const vnode = element[vueKey];
				if (vnode && vnode.type && vnode.type.__file) {
					console.log('[Roopik] ✓ Found Vue source:', vnode.type.__file);
					return {
						fileName: vnode.type.__file,
						lineNumber: 1,
						columnNumber: 0,
						componentName: vnode.type.name || 'VueComponent'
					};
				}
				console.log('[Roopik] Vue vnode has no __file');
			} else {
				console.log('[Roopik] No Vue vnode found on element');
			}

			// Try Svelte
			console.log('[Roopik] Checking Svelte...');
			const svelteKey = Object.keys(element).find(key => key.startsWith('__svelte'));
			if (svelteKey) {
				console.log('[Roopik] Found Svelte key:', svelteKey);
				// Svelte stores component info differently
				const svelteData = element[svelteKey];
				if (svelteData && svelteData.$$.ctx) {
					console.log('[Roopik] ✓ Found Svelte component');
					// Svelte doesn't expose file info easily, would need build-time injection
				}
			}

			console.log('[Roopik] No framework-specific source info found');
			console.log('[Roopik] Element keys:', Object.keys(element).filter(k => k.startsWith('__') || k.startsWith('_')));

			return null;
		} catch (error) {
			console.error('[Roopik] Error finding source:', error);
			return null;
		}
	}

	function getComponentName(fiber) {
		if (fiber.type && typeof fiber.type === 'function') {
			return fiber.type.name || fiber.type.displayName || 'Component';
		}
		if (fiber.type && typeof fiber.type === 'string') {
			return fiber.type;
		}
		return 'Unknown';
	}

	// Initial URL notification
	window.parent.postMessage({ type: 'roopik-navigate', url: location.href }, '*');
})();
</script>
\`;

			return html.replace('</body>', script + '</body>');
		}
	};
}
`;

			fs.writeFileSync(pluginPath, pluginCode, 'utf-8');
			this.outputChannel.appendLine('[Roopik] ✓ Created roopik-plugin.js');

			// Update vite.config to use plugin
			this.updateViteConfig();

			this.outputChannel.appendLine('[Roopik] ✓ Roopik plugin injection complete');
		} catch (error) {
			this.outputChannel.appendLine(`[Roopik] ✗ Failed to inject plugin: ${error}`);
			throw error;
		}
	}

	/**
	 * Update vite.config to include Roopik plugin
	 */
	private updateViteConfig(): void {
		const viteConfigPath = path.join(this.projectRoot, 'vite.config.js');
		const viteConfigTsPath = path.join(this.projectRoot, 'vite.config.ts');

		let configPath = '';

		if (fs.existsSync(viteConfigPath)) {
			configPath = viteConfigPath;
			this.outputChannel.appendLine('[Roopik] Found vite.config.js');
		} else if (fs.existsSync(viteConfigTsPath)) {
			configPath = viteConfigTsPath;
			this.outputChannel.appendLine('[Roopik] Found vite.config.ts');
		} else {
			// Create minimal vite.config.js
			configPath = viteConfigPath;
			this.outputChannel.appendLine('[Roopik] No vite.config found, creating new one...');
			const minimalConfig = `import { defineConfig } from 'vite';
import roopikPlugin from './roopik-plugin.js';

export default defineConfig({
	plugins: [roopikPlugin()]
});
`;
			fs.writeFileSync(configPath, minimalConfig, 'utf-8');
			this.outputChannel.appendLine('[Roopik] ✓ Created vite.config.js with Roopik plugin');
			return;
		}

		// Read existing config
		let config = fs.readFileSync(configPath, 'utf-8');

		// Detect project type for framework-specific configuration
		const projectType = this.detectProjectType();

		// Check if we need to add roopik plugin
		const needsRoopikPlugin = !config.includes('roopikPlugin');

		if (needsRoopikPlugin) {
			this.outputChannel.appendLine('[Roopik] Updating vite.config to add Roopik plugin...');

			// Add import at top
			const importLine = "import roopikPlugin from './roopik-plugin.js';\n";
			// Insert after other imports or at start
			if (config.includes('import')) {
				const lastImportIndex = config.lastIndexOf('import');
				const endOfLineIndex = config.indexOf('\n', lastImportIndex);
				config = config.slice(0, endOfLineIndex + 1) + importLine + config.slice(endOfLineIndex + 1);
				this.outputChannel.appendLine('[Roopik]   Added import statement');
			} else {
				config = importLine + config;
				this.outputChannel.appendLine('[Roopik]   Added import at top');
			}
		} else {
			this.outputChannel.appendLine('[Roopik] ✓ Vite config already has Roopik plugin import');
		}

		// Configure framework-specific debug info
		// For @vitejs/plugin-react v5+, we need to explicitly enable jsxDev for debug source
		// AND add our custom Babel plugin to inject data-roopik-source attributes
		if (projectType === 'vite-react') {
			if (!config.includes('roopik-babel-plugin')) {
				// Need to add Babel plugin
				if (config.includes('react()') && !config.includes('react({')) {
					// Simple react() call - replace with full config
					config = config.replace(
						/react\(\)/g,
						`react({
	jsxDev: true,
	babel: {
		plugins: ['./roopik-babel-plugin.js']
	}
})`
					);
					this.outputChannel.appendLine('[Roopik]   Configured React plugin with jsxDev + Babel plugin');
				} else if (config.includes('react({')) {
					// React already has config object
					if (config.includes('jsxDev:')) {
						// Has jsxDev, add babel config
						config = config.replace(
							/react\(\{([^}]+)\}\)/,
							`react({$1,
	babel: {
		plugins: ['./roopik-babel-plugin.js']
	}
})`
						);
						this.outputChannel.appendLine('[Roopik]   Added Babel plugin to existing React config');
					} else {
						// Add both jsxDev and babel
						config = config.replace(
							/react\(\{/,
							`react({
	jsxDev: true,
	babel: {
		plugins: ['./roopik-babel-plugin.js']
	},`
						);
						this.outputChannel.appendLine('[Roopik]   Added jsxDev + Babel plugin to React config');
					}
				}
			} else {
				this.outputChannel.appendLine('[Roopik]   React plugin already has Roopik Babel plugin');
			}
		}

		// Configure Vue plugin if present
		if (projectType === 'vite-vue' && config.includes('vue()') && !config.includes('vue({')) {
			// Vue includes __file in dev mode by default, but ensure it's explicit
			config = config.replace(
				/vue\(\)/g,
				`vue({
	template: {
		compilerOptions: {
			comments: true // Preserve comments for debugging
		}
	}
})`
			);
			this.outputChannel.appendLine('[Roopik]   Configured Vue plugin for debug mode');
		}

		// Add roopikPlugin to plugins array if needed
		if (needsRoopikPlugin) {
			if (config.includes('plugins:')) {
				// Find plugins array and add roopikPlugin()
				config = config.replace(/plugins:\s*\[/, 'plugins: [roopikPlugin(), ');
				this.outputChannel.appendLine('[Roopik]   Added to existing plugins array');
			} else {
				// Add plugins array
				config = config.replace(/export default defineConfig\({/, 'export default defineConfig({\n  plugins: [roopikPlugin()],');
				this.outputChannel.appendLine('[Roopik]   Created plugins array');
			}
		}

		fs.writeFileSync(configPath, config, 'utf-8');
		this.outputChannel.appendLine('[Roopik] ✓ Updated ' + path.basename(configPath));
	}

	/**
	 * Clean up resources
	 */
	public dispose(): void {
		// Stop server first
		this.stop();

		// Clean up plugin files
		const pluginPath = path.join(this.projectRoot, 'roopik-plugin.js');
		const babelPluginPath = path.join(this.projectRoot, 'roopik-babel-plugin.js');

		if (fs.existsSync(pluginPath)) {
			try {
				fs.unlinkSync(pluginPath);
				console.log('[Roopik] Cleaned up roopik-plugin.js');
			} catch (error) {
				console.error('[Roopik] Failed to clean up plugin:', error);
			}
		}

		if (fs.existsSync(babelPluginPath)) {
			try {
				fs.unlinkSync(babelPluginPath);
				console.log('[Roopik] Cleaned up roopik-babel-plugin.js');
			} catch (error) {
				console.error('[Roopik] Failed to clean up Babel plugin:', error);
			}
		}

		// Dispose output channel after server is stopped
		if (this.outputChannel) {
			this.outputChannel.dispose();
		}

		// Clear singleton instance so it can be recreated
		ViteServerManager.instance = undefined;
	}
}
