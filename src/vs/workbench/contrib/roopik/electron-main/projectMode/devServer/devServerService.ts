/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { join, normalize, dirname } from '../../../../../../base/common/path.js';
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
import type { ProjectStorageService } from '../../projectStorage/projectStorageService.js';

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
 * Worker process message types
 */
interface WorkerMessageBase {
	type: string;
}

interface WorkerReadyMessage extends WorkerMessageBase {
	type: 'READY';
	url: string;
	port: number;
	framework: Framework;
	frameworkName?: string; // Human-readable name (e.g., "React + Vite")
}

interface WorkerErrorMessage extends WorkerMessageBase {
	type: 'ERROR';
	message: string;
}

type WorkerMessage = WorkerReadyMessage | WorkerErrorMessage;

/**
 * Get the directory of this module (ES module compatible)
 * Uses import.meta.url which is available in ES modules
 */
function getModuleDir(): string {
	// In ES modules, import.meta.url gives us the file:// URL of this module
	const thisFileUrl = import.meta.url;
	const thisFilePath = fileURLToPath(thisFileUrl);
	return dirname(thisFilePath);
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
	// Dependencies
	// ============================================

	constructor(
		private readonly projectStorageService?: ProjectStorageService
	) { }

	// ============================================
	// Server Lifecycle
	// ============================================

	async startServer(options: DevServerStartOptions): Promise<string> {
		const { projectRoot, port = 5173, forceRegexMode = false, verboseLogging = false } = options;

		// Normalize path
		const normalizedRoot = normalize(projectRoot);

		// =====================================================
		// VALIDATE PROJECT DIRECTORY EXISTS
		// =====================================================
		if (!fs.existsSync(normalizedRoot)) {
			const error = new Error(`Project directory not found: ${normalizedRoot}`);
			this.setError(normalizedRoot, error.message);
			throw error;
		}

		if (!fs.statSync(normalizedRoot).isDirectory()) {
			const error = new Error(`Path is not a directory: ${normalizedRoot}`);
			this.setError(normalizedRoot, error.message);
			throw error;
		}

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
			const workerPath = join(moduleDir, 'devServerWorker.mjs');

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
			workerProcess.on('message', (msg: WorkerMessage) => {
				if (msg.type === 'READY') {
					// Worker successfully started the server
					instance.state = 'running';
					instance.url = msg.url;
					instance.port = msg.port;
					instance.framework = msg.framework;

					// Update active project in storage (unified flow for UI and MCP)
					// This saves project AND sets it as active in one place
					this.updateActiveProjectStorage(
						normalizedRoot,
						instance.workerProcess?.pid,
						msg.port,
						msg.url,
						msg.framework,
						msg.frameworkName
					);

					this.fireStatus(normalizedRoot, 'running', {
						url: msg.url,
						port: msg.port,
						framework: instance.framework,
						frameworkDisplayName: msg.frameworkName
					});

					this.log(normalizedRoot, 'info', `Server ready at ${msg.url}`);
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
		const normalizedRoot = normalize(projectRoot);
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

		// Clear active project in storage (unified flow for UI and MCP)
		this.clearActiveProjectStorage();

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
		const normalizedRoot = normalize(projectRoot);
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
			pid: instance.workerProcess?.pid,
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
		const normalizedRoot = normalize(projectRoot);
		const packageJsonPath = join(normalizedRoot, 'package.json');

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
		const normalizedRoot = normalize(projectRoot);
		const nodeModulesPath = join(normalizedRoot, 'node_modules');
		return fs.existsSync(nodeModulesPath);
	}

	async installDependencies(projectRoot: string): Promise<void> {
		const normalizedRoot = normalize(projectRoot);

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
		extra?: { url?: string; port?: number; framework?: Framework; frameworkDisplayName?: string; error?: string }
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
	// Project Storage (Unified Flow)
	// ============================================

	/**
	 * Update active project in storage when server starts
	 * Called from both UI and MCP flows
	 *
	 * This does TWO things:
	 * 1. upsertProject - adds/updates project in recent projects list (returns projectId)
	 * 2. setActiveProject - marks this project as the currently running one (uses that projectId)
	 */
	private async updateActiveProjectStorage(
		projectRoot: string,
		pid: number | undefined,
		port: number,
		url: string,
		framework?: string,
		frameworkDisplayName?: string
	): Promise<void> {
		if (!this.projectStorageService) {
			return;
		}

		try {
			const projectName = projectRoot.split(/[/\\]/).pop() || 'project';

			// 1. Upsert project to recent projects list (returns the actual projectId)
			const projectId = await this.projectStorageService.upsertProject(
				projectName,
				projectRoot,
				framework,
				frameworkDisplayName
			);
			this.log(projectRoot, 'info', `Project saved: ${projectId}`);

			// 2. Set as active project using the SAME projectId
			await this.projectStorageService.setActiveProject(projectId, pid || 0, port, url);
			this.log(projectRoot, 'info', `Active project set: ${projectId}`);
		} catch (error) {
			this.log(projectRoot, 'warn', `Failed to update active project storage: ${error}`);
		}
	}

	/**
	 * Clear active project in storage when server stops
	 * Called from both UI and MCP flows
	 */
	private async clearActiveProjectStorage(): Promise<void> {
		if (!this.projectStorageService) {
			return;
		}

		try {
			await this.projectStorageService.clearActiveProject();
		} catch (error) {
			console.warn('[DevServerService] Failed to clear active project storage:', error);
		}
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
