/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as crypto from 'crypto';

/**
 * Vite Server Manager - Worker Pattern
 *
 * Uses CHILD PROCESS (not in-process) to avoid:
 * - Native module crashes (esbuild ABI mismatch)
 * - UI freezing (heavy bundling operations)
 * - Extension crashes (user code errors)
 *
 * Architecture:
 * Extension → fork(serverWorker.js) → Vite.createServer() → localhost:5173
 */
export class ViteServerManager {
	private static instance: ViteServerManager | undefined;
	private workerProcess: cp.ChildProcess | undefined;
	private serverUrl: string | undefined;
	private authToken: string | undefined;
	private projectRoot: string;
	private extensionPath: string;
	private outputChannel: vscode.OutputChannel;

	private constructor(projectRoot: string, extensionPath: string) {
		this.projectRoot = projectRoot;
		this.extensionPath = extensionPath;
		this.outputChannel = vscode.window.createOutputChannel('Roopik Dev Server');
	}

	public static getInstance(projectRoot: string, extensionPath: string): ViteServerManager {
		if (!ViteServerManager.instance || ViteServerManager.instance.projectRoot !== projectRoot) {
			ViteServerManager.instance = new ViteServerManager(projectRoot, extensionPath);
		}
		return ViteServerManager.instance;
	}

	/**
	 * Start dev server using worker process
	 */
	public async start(): Promise<string> {
		this.outputChannel.show();
		this.outputChannel.appendLine('[Roopik] Starting dev server (worker pattern)...');

		// Check if dependencies are installed
		const hasNodeModules = fs.existsSync(path.join(this.projectRoot, 'node_modules'));
		if (!hasNodeModules) {
			this.outputChannel.appendLine('[Roopik] node_modules not found. Installing dependencies...');
			await this.installDependencies();
		}

		// Detect framework
		const framework = this.detectFramework();
		this.outputChannel.appendLine(`[Roopik] Detected framework: ${framework}`);

		if (framework === 'unknown') {
			throw new Error('Could not detect supported framework (Vite, Next.js, etc.)');
		}

		// Generate random auth token
		this.authToken = crypto.randomBytes(32).toString('hex');
		this.outputChannel.appendLine(`[Roopik] Generated auth token: ${this.authToken.substring(0, 8)}...`);

		// Start worker process
		return await this.startWorker(framework);
	}

	/**
	 * Start worker process with Vite programmatic API
	 */
	private async startWorker(framework: string): Promise<string> {
		return new Promise((resolve, reject) => {
			// Path to compiled worker script
			const workerPath = path.join(this.extensionPath, 'out', 'devServer', 'serverWorker.js');

			this.outputChannel.appendLine(`[Roopik] Worker script: ${workerPath}`);

			if (!fs.existsSync(workerPath)) {
				reject(new Error(`Worker script not found: ${workerPath}`));
				return;
			}

			// Fork worker process (runs in user's System Node.js, not Electron's Node)
			this.workerProcess = cp.fork(workerPath, [], {
				cwd: this.projectRoot,
				env: {
					...process.env,
					FORCE_COLOR: '0' // Disable colors for clean parsing
				},
				stdio: ['pipe', 'pipe', 'pipe', 'ipc'] // Enable IPC
			});

			this.outputChannel.appendLine('[Roopik] Worker process forked (PID: ' + this.workerProcess.pid + ')');

			// Listen for stdout/stderr
			this.workerProcess.stdout?.on('data', (data) => {
				this.outputChannel.append(data.toString());
			});

			this.workerProcess.stderr?.on('data', (data) => {
				this.outputChannel.append(data.toString());
			});

			// Listen for IPC messages from worker
			this.workerProcess.on('message', (msg: any) => {
				if (msg.type === 'READY') {
					this.serverUrl = msg.url;
					this.outputChannel.appendLine(`[Roopik] ✓ Server ready: ${msg.url}`);
					resolve(msg.url);
				} else if (msg.type === 'ERROR') {
					this.outputChannel.appendLine(`[Roopik] ✗ Worker error: ${msg.message}`);
					this.outputChannel.appendLine(msg.stack || '');
					reject(new Error(msg.message));
				}
			});

			// Handle worker process errors
			this.workerProcess.on('error', (error) => {
				this.outputChannel.appendLine(`[Roopik] ✗ Worker process error: ${error.message}`);
				reject(error);
			});

			this.workerProcess.on('exit', (code, signal) => {
				this.outputChannel.appendLine(`[Roopik] Worker process exited (code: ${code}, signal: ${signal})`);
				this.workerProcess = undefined;
				this.serverUrl = undefined;
			});

			// Send START command to worker
			this.workerProcess.send({
				type: 'START',
				payload: {
					root: this.projectRoot,
					port: 5173,
					authToken: this.authToken,
					framework: framework
				}
			});

			this.outputChannel.appendLine('[Roopik] Sent START command to worker');

			// Timeout after 60 seconds
			setTimeout(() => {
				if (!this.serverUrl) {
					reject(new Error('Server start timeout (60s)'));
				}
			}, 60000);
		});
	}

	/**
	 * Stop the dev server
	 */
	public stop(): void {
		if (this.workerProcess) {
			console.log('[Roopik] Stopping worker process...');

			// Send STOP message first (graceful shutdown)
			try {
				this.workerProcess.send({ type: 'STOP' });
			} catch (error) {
				// Process might already be dead
			}

			// Kill after 2 seconds if not stopped
			setTimeout(() => {
				if (this.workerProcess && !this.workerProcess.killed) {
					if (process.platform === 'win32') {
						try {
							require('child_process').execSync(`taskkill /pid ${this.workerProcess.pid} /T /F`);
						} catch (error) {
							console.error('[Roopik] Error killing process:', error);
						}
					} else {
						try {
							process.kill(-this.workerProcess.pid!, 'SIGTERM');
						} catch (error) {
							this.workerProcess?.kill('SIGTERM');
						}
					}
				}
			}, 2000);

			this.workerProcess = undefined;
			this.serverUrl = undefined;
			this.authToken = undefined;
			console.log('[Roopik] Dev server stopped');
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
			const install = cp.spawn(npmCmd, ['install'], {
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
					this.outputChannel.appendLine('[Roopik] ✓ Dependencies installed');
					resolve();
				} else {
					reject(new Error(`npm install failed with code ${code}`));
				}
			});
		});
	}

	/**
	 * Detect framework (Vite, Next.js, Webpack, etc.)
	 */
	private detectFramework(): string {
		const packageJsonPath = path.join(this.projectRoot, 'package.json');

		if (!fs.existsSync(packageJsonPath)) {
			return 'unknown';
		}

		try {
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
			const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
			const scripts = packageJson.scripts || {};

			// Check for Vite
			if (deps['vite']) {
				return 'vite';
			}

			// Check for Next.js
			if (deps['next']) {
				return 'nextjs';
			}

			// Check for Webpack
			if (deps['webpack'] || scripts.dev?.includes('webpack')) {
				return 'webpack';
			}

			// Check for Create React App
			if (deps['react-scripts']) {
				return 'create-react-app';
			}

			return 'unknown';
		} catch (error) {
			this.outputChannel.appendLine(`[Roopik] Error reading package.json: ${error}`);
			return 'unknown';
		}
	}

	/**
	 * Clean up resources
	 */
	public dispose(): void {
		this.stop();

		if (this.outputChannel) {
			this.outputChannel.dispose();
		}

		ViteServerManager.instance = undefined;
	}
}
