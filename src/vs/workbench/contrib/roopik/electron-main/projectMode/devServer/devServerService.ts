/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { fileURLToPath } from 'url';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import type {
	IDevServerService,
	DevServerStartOptions,
	DevServerInfo,
	DevServerStatusEvent,
	DevServerLogEvent,
	DevServerState,
	Framework,
	FrameworkInfo
} from '../../../common/projectMode/devServer.js';

/**
 * Server instance data
 */
interface ServerInstance {
	projectRoot: string;
	state: DevServerState;
	url?: string;
	port?: number;
	framework?: Framework;
	workerProcess?: cp.ChildProcess;
}

/**
 * Get the directory of this module (ES module compatible)
 * Works with both __dirname (CJS) and import.meta.url (ESM)
 */
function getModuleDir(): string {
	// In VSCode's compiled output, we're in ESM context
	// Use import.meta.url if available, otherwise fall back to __dirname
	try {
		// This file's URL when running as ESM
		const thisFileUrl = import.meta.url;
		return path.dirname(fileURLToPath(thisFileUrl));
	} catch {
		// Fallback for CJS context (shouldn't happen in VSCode core)
		return __dirname;
	}
}

/**
 * Dev Server Service
 *
 * Main process service that manages Vite dev servers via child processes.
 * Each project gets its own worker process for isolation.
 *
 * Architecture:
 * - Main process (this service) manages worker lifecycle
 * - Worker process (devServerWorker.mjs) runs Vite in user's project context
 * - Worker handles all prerequisite checks and framework detection
 * - Communication via IPC messages
 */
export class DevServerService implements IDevServerService {
	readonly _serviceBrand: undefined;

	// ============================================
	// Events
	// ============================================

	private readonly _onStatusChanged = new Emitter<DevServerStatusEvent>();
	readonly onStatusChanged: Event<DevServerStatusEvent> = this._onStatusChanged.event;

	private readonly _onLog = new Emitter<DevServerLogEvent>();
	readonly onLog: Event<DevServerLogEvent> = this._onLog.event;

	// ============================================
	// State
	// ============================================

	private servers = new Map<string, ServerInstance>();

	// ============================================
	// Server Lifecycle
	// ============================================

	async startServer(options: DevServerStartOptions): Promise<string> {
		const { projectRoot, port = 5173, forceRegexMode = false, verboseLogging = false } = options;

		// Normalize path
		const normalizedRoot = path.normalize(projectRoot);

		// =====================================================
		// SINGLE SERVER CONSTRAINT (Defense in Depth)
		// Only ONE dev server can run at a time globally!
		// The Editor should enforce this, but we double-check here.
		// =====================================================

		// Check if THIS project is already running - return existing URL
		const existing = this.servers.get(normalizedRoot);
		if (existing && existing.state === 'running' && existing.url) {
			this.log(normalizedRoot, 'info', `Server already running at ${existing.url}`);
			return existing.url;
		}

		// Check if ANY OTHER project is running - stop it first!
		for (const [otherRoot, instance] of this.servers.entries()) {
			if (otherRoot !== normalizedRoot && (instance.state === 'running' || instance.state === 'starting')) {
				this.log(normalizedRoot, 'warn', `Another server running at ${otherRoot}, stopping it first (single server constraint)`);
				await this.stopServer(otherRoot);
			}
		}

		// Stop existing if in error/stopped state (cleanup stale entry)
		if (existing) {
			await this.stopServer(normalizedRoot);
		}

		// Create server instance
		const instance: ServerInstance = {
			projectRoot: normalizedRoot,
			state: 'starting'
		};
		this.servers.set(normalizedRoot, instance);

		// Fire status event ONCE
		this.fireStatus(normalizedRoot, 'starting');

		// Start worker process
		// NOTE: All prerequisite checks are handled by the worker
		// This keeps the main process simple and moves complexity to the worker
		return new Promise((resolve, reject) => {
			// Find worker script (ES module version)
			const moduleDir = getModuleDir();
			const workerPath = path.join(moduleDir, 'devServerWorker.mjs');

			// Check if worker exists
			if (!fs.existsSync(workerPath)) {
				const error = new Error(`Worker script not found: ${workerPath}`);
				this.setError(normalizedRoot, error.message);
				reject(error);
				return;
			}

			this.log(normalizedRoot, 'info', 'Starting dev server worker...');

			// Fork worker process as ES module
			// Use execArgv to enable ES module loading
			const workerProcess = cp.fork(workerPath, [], {
				cwd: normalizedRoot,
				env: {
					...process.env,
					FORCE_COLOR: '0',
					NODE_OPTIONS: '' // Clear any existing NODE_OPTIONS to avoid conflicts
				},
				stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
				// No execArgv needed - .mjs extension tells Node to use ESM
			});

			instance.workerProcess = workerProcess;

			// Handle stdout (worker logs)
			workerProcess.stdout?.on('data', (data) => {
				const lines = data.toString().split('\n').filter((line: string) => line.trim());
				for (const line of lines) {
					this.log(normalizedRoot, 'info', line);
				}
			});

			// Handle stderr
			workerProcess.stderr?.on('data', (data) => {
				const lines = data.toString().split('\n').filter((line: string) => line.trim());
				for (const line of lines) {
					this.log(normalizedRoot, 'error', line);
				}
			});

			// Handle IPC messages from worker
			workerProcess.on('message', (msg: any) => {
				if (msg.type === 'READY') {
					// Worker successfully started the server
					instance.state = 'running';
					instance.url = msg.url;
					instance.port = msg.port;
					instance.framework = msg.framework as Framework;

					this.fireStatus(normalizedRoot, 'running', {
						url: msg.url,
						port: msg.port,
						framework: instance.framework
					});

					this.log(normalizedRoot, 'info', `✅ Server ready at ${msg.url}`);
					resolve(msg.url);

				} else if (msg.type === 'ERROR') {
					// Worker encountered an error
					const error = new Error(msg.message);
					this.setError(normalizedRoot, msg.message);
					reject(error);
				}
			});

			// Handle process errors (fork failed, etc.)
			workerProcess.on('error', (error) => {
				this.setError(normalizedRoot, `Worker process error: ${error.message}`);
				reject(error);
			});

			// Handle process exit
			workerProcess.on('exit', (code, signal) => {
				this.log(normalizedRoot, 'info', `Worker exited (code: ${code}, signal: ${signal})`);

				// Only set to stopped if not already in error state
				if (instance.state !== 'error') {
					instance.state = 'stopped';
					instance.url = undefined;
					instance.port = undefined;
					instance.workerProcess = undefined;
					this.fireStatus(normalizedRoot, 'stopped');
				}
			});

			// Send START command to worker
			workerProcess.send({
				type: 'START',
				payload: {
					root: normalizedRoot,
					port,
					pluginConfig: {
						forceRegexMode,
						verboseLogging
					}
				}
			});

			// Timeout after 60 seconds
			setTimeout(() => {
				if (instance.state === 'starting') {
					this.setError(normalizedRoot, 'Server start timeout (60s)');
					reject(new Error('Server start timeout (60s)'));
				}
			}, 60000);
		});
	}

	async stopServer(projectRoot: string): Promise<void> {
		const normalizedRoot = path.normalize(projectRoot);
		const instance = this.servers.get(normalizedRoot);

		if (!instance) {
			return;
		}

		this.log(normalizedRoot, 'info', 'Stopping server...');

		if (instance.workerProcess) {
			// Send STOP message
			try {
				instance.workerProcess.send({ type: 'STOP' });
			} catch {
				// Process might already be dead
			}

			// Force kill after timeout
			setTimeout(() => {
				if (instance.workerProcess && !instance.workerProcess.killed) {
					if (process.platform === 'win32') {
						try {
							cp.execSync(`taskkill /pid ${instance.workerProcess.pid} /T /F`, { stdio: 'ignore' });
						} catch {
							// Ignore
						}
					} else {
						try {
							process.kill(-instance.workerProcess.pid!, 'SIGTERM');
						} catch {
							instance.workerProcess?.kill('SIGTERM');
						}
					}
				}
			}, 2000);
		}

		// Cleanup
		instance.state = 'stopped';
		instance.url = undefined;
		instance.port = undefined;
		instance.workerProcess = undefined;

		this.fireStatus(normalizedRoot, 'stopped');
		this.log(normalizedRoot, 'info', 'Server stopped');
	}

	async stopAllServers(): Promise<void> {
		const stopPromises: Promise<void>[] = [];

		for (const projectRoot of this.servers.keys()) {
			stopPromises.push(this.stopServer(projectRoot));
		}

		await Promise.all(stopPromises);
	}

	async getServerInfo(projectRoot: string): Promise<DevServerInfo | undefined> {
		const normalizedRoot = path.normalize(projectRoot);
		const instance = this.servers.get(normalizedRoot);

		if (!instance) {
			return undefined;
		}

		const frameworkInfo = instance.framework
			? await this.getFrameworkInfo(instance.framework)
			: undefined;

		return {
			projectRoot: instance.projectRoot,
			state: instance.state,
			url: instance.url,
			port: instance.port,
			framework: instance.framework,
			frameworkDisplayName: frameworkInfo?.displayName,
			supportsClickToSource: frameworkInfo?.supportsClickToSource
		};
	}

	async getAllServers(): Promise<DevServerInfo[]> {
		const servers: DevServerInfo[] = [];

		for (const instance of this.servers.values()) {
			const info = await this.getServerInfo(instance.projectRoot);
			if (info) {
				servers.push(info);
			}
		}

		return servers;
	}

	/**
	 * Get the currently running server (if any)
	 * Since we enforce single server constraint, there can be at most one.
	 */
	async getRunningServer(): Promise<DevServerInfo | undefined> {
		for (const instance of this.servers.values()) {
			if (instance.state === 'running' && instance.url) {
				return this.getServerInfo(instance.projectRoot);
			}
		}
		return undefined;
	}

	/**
	 * Quick check if any server is running
	 */
	async isAnyServerRunning(): Promise<boolean> {
		for (const instance of this.servers.values()) {
			if (instance.state === 'running' || instance.state === 'starting') {
				return true;
			}
		}
		return false;
	}

	// ============================================
	// Framework Detection
	// ============================================

	async detectFramework(projectRoot: string): Promise<FrameworkInfo> {
		const normalizedRoot = path.normalize(projectRoot);
		const packageJsonPath = path.join(normalizedRoot, 'package.json');

		if (!fs.existsSync(packageJsonPath)) {
			return {
				framework: 'unknown',
				displayName: 'Unknown',
				supported: false,
				supportsClickToSource: false
			};
		}

		try {
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
			const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

			let framework: Framework = 'unknown';

			// Check for Vite-based frameworks
			if (deps['vite']) {
				if (deps['react'] || deps['@vitejs/plugin-react']) {
					framework = 'react-vite';
				} else if (deps['vue'] || deps['@vitejs/plugin-vue']) {
					framework = 'vue-vite';
				} else if (deps['svelte'] || deps['@sveltejs/vite-plugin-svelte']) {
					framework = 'svelte-vite';
				} else if (deps['solid-js'] || deps['vite-plugin-solid']) {
					framework = 'solid-vite';
				} else {
					framework = 'plain-html-vite';
				}
			} else if (deps['next']) {
				framework = 'nextjs';
			} else if (deps['nuxt']) {
				framework = 'nuxt';
			} else if (deps['@sveltejs/kit']) {
				framework = 'sveltekit';
			} else if (deps['react-scripts']) {
				framework = 'react-cra';
			} else if (deps['webpack'] && deps['react']) {
				framework = 'react-webpack';
			} else if (deps['webpack'] && deps['vue']) {
				framework = 'vue-webpack';
			}

			return this.getFrameworkInfo(framework);
		} catch {
			return {
				framework: 'unknown',
				displayName: 'Unknown',
				supported: false,
				supportsClickToSource: false
			};
		}
	}

	private getFrameworkInfo(framework: Framework): FrameworkInfo {
		const displayNames: Record<Framework, string> = {
			'react-vite': 'React (Vite)',
			'vue-vite': 'Vue 3 (Vite)',
			'svelte-vite': 'Svelte (Vite)',
			'solid-vite': 'SolidJS (Vite)',
			'plain-html-vite': 'Plain HTML (Vite)',
			'nextjs': 'Next.js',
			'nuxt': 'Nuxt',
			'sveltekit': 'SvelteKit',
			'react-cra': 'React (Create React App)',
			'react-webpack': 'React (Webpack)',
			'vue-webpack': 'Vue (Webpack)',
			'unknown': 'Unknown'
		};

		const supported = [
			'react-vite',
			'vue-vite',
			'svelte-vite',
			'solid-vite',
			'plain-html-vite'
		].includes(framework);

		const supportsClickToSource = [
			'react-vite',
			'vue-vite',
			'solid-vite',
			'plain-html-vite'
		].includes(framework);

		return {
			framework,
			displayName: displayNames[framework],
			supported,
			supportsClickToSource
		};
	}

	async hasNodeModules(projectRoot: string): Promise<boolean> {
		const normalizedRoot = path.normalize(projectRoot);
		const nodeModulesPath = path.join(normalizedRoot, 'node_modules');
		return fs.existsSync(nodeModulesPath);
	}

	async installDependencies(projectRoot: string): Promise<void> {
		const normalizedRoot = path.normalize(projectRoot);

		return new Promise((resolve, reject) => {
			const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

			const install = cp.spawn(npmCmd, ['install'], {
				cwd: normalizedRoot,
				shell: true,
				stdio: 'pipe'
			});

			install.stdout?.on('data', (data) => {
				this.log(normalizedRoot, 'info', data.toString().trim());
			});

			install.stderr?.on('data', (data) => {
				this.log(normalizedRoot, 'warn', data.toString().trim());
			});

			install.on('close', (code) => {
				if (code === 0) {
					this.log(normalizedRoot, 'info', '✓ Dependencies installed');
					resolve();
				} else {
					reject(new Error(`npm install failed with code ${code}`));
				}
			});

			install.on('error', (error) => {
				reject(error);
			});
		});
	}

	// ============================================
	// Helpers
	// ============================================

	private fireStatus(
		projectRoot: string,
		state: DevServerState,
		extra?: { url?: string; port?: number; framework?: Framework; error?: string }
	): void {
		this._onStatusChanged.fire({
			projectRoot,
			state,
			...extra
		});
	}

	private setError(projectRoot: string, message: string): void {
		const instance = this.servers.get(projectRoot);
		if (instance) {
			instance.state = 'error';
		}
		this.fireStatus(projectRoot, 'error', { error: message });
		this.log(projectRoot, 'error', message);
	}

	private log(projectRoot: string, level: 'info' | 'warn' | 'error', message: string): void {
		this._onLog.fire({ projectRoot, level, message });
	}

	// ============================================
	// Cleanup
	// ============================================

	dispose(): void {
		// Stop all servers synchronously
		for (const instance of this.servers.values()) {
			if (instance.workerProcess && !instance.workerProcess.killed) {
				try {
					instance.workerProcess.send({ type: 'STOP' });
				} catch {
					// Ignore
				}
			}
		}

		this.servers.clear();
		this._onStatusChanged.dispose();
		this._onLog.dispose();
	}
}
