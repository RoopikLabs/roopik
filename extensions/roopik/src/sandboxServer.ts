/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { createServer, ViteDevServer } from 'vite';

/**
 * Manages Vite dev servers for sandbox previews
 * Each sandbox gets its own Vite server with HMR enabled
 */
export class SandboxServerManager {
	private servers: Map<string, ViteDevServer> = new Map();
	private portCounter = 5173; // Start from Vite's default port
	private tempDir: string;

	constructor(context: vscode.ExtensionContext) {
		// Create temp directory for sandbox files
		this.tempDir = path.join(context.globalStorageUri.fsPath, 'sandboxes');
		if (!fs.existsSync(this.tempDir)) {
			fs.mkdirSync(this.tempDir, { recursive: true });
		}
	}

	/**
	 * Create a Vite dev server for a sandbox
	 * Writes files to temp directory and starts dev server
	 */
	async createSandboxServer(sandboxId: string, files: { [path: string]: string }, entryPoint: string): Promise<string> {
		// Create sandbox directory
		const sandboxDir = path.join(this.tempDir, sandboxId);
		if (!fs.existsSync(sandboxDir)) {
			fs.mkdirSync(sandboxDir, { recursive: true });
		}

		// Write all files to disk
		for (const [filePath, content] of Object.entries(files)) {
			const fullPath = path.join(sandboxDir, filePath);
			const dir = path.dirname(fullPath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			fs.writeFileSync(fullPath, content, 'utf-8');
		}

		// Create index.html if it doesn't exist
		const indexPath = path.join(sandboxDir, 'index.html');
		if (!fs.existsSync(indexPath)) {
			// Create a basic HTML template that imports the entry point
			const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sandbox Preview</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/${entryPoint}"></script>
</body>
</html>`;
			fs.writeFileSync(indexPath, html, 'utf-8');
		}

		// Create Vite server
		const port = this.portCounter++;

		// Load React plugin at runtime to avoid TypeScript module resolution issues
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const reactPlugin = require('@vitejs/plugin-react').default;

		const server = await createServer({
			root: sandboxDir,
			server: {
				port,
				strictPort: true,
				hmr: {
					protocol: 'ws',
					host: 'localhost',
					port,
				},
				cors: true,
			},
			plugins: [reactPlugin()],
			optimizeDeps: {
				include: ['react', 'react-dom'],
			},
			clearScreen: false,
			logLevel: 'error', // Reduce console noise
		});

		await server.listen();
		this.servers.set(sandboxId, server);

		const url = `http://localhost:${port}`;
		console.log(`[SandboxServer] Started Vite server for ${sandboxId} at ${url}`);
		return url;
	}

	/**
	 * Update sandbox files and trigger HMR
	 */
	async updateSandboxFiles(sandboxId: string, files: { [path: string]: string }): Promise<void> {
		const sandboxDir = path.join(this.tempDir, sandboxId);
		if (!fs.existsSync(sandboxDir)) {
			throw new Error(`Sandbox directory not found: ${sandboxId}`);
		}

		// Write updated files
		for (const [filePath, content] of Object.entries(files)) {
			const fullPath = path.join(sandboxDir, filePath);
			fs.writeFileSync(fullPath, content, 'utf-8');
		}

		// Vite will automatically detect file changes and trigger HMR!
		console.log(`[SandboxServer] Updated files for ${sandboxId}, HMR will trigger automatically`);
	}

	/**
	 * Stop a sandbox server
	 */
	async stopSandboxServer(sandboxId: string): Promise<void> {
		const server = this.servers.get(sandboxId);
		if (server) {
			await server.close();
			this.servers.delete(sandboxId);
			console.log(`[SandboxServer] Stopped server for ${sandboxId}`);
		}

		// Clean up sandbox directory
		const sandboxDir = path.join(this.tempDir, sandboxId);
		if (fs.existsSync(sandboxDir)) {
			fs.rmSync(sandboxDir, { recursive: true, force: true });
		}
	}

	/**
	 * Stop all sandbox servers (cleanup on extension deactivation)
	 */
	async stopAllServers(): Promise<void> {
		console.log(`[SandboxServer] Stopping all ${this.servers.size} servers...`);
		for (const [sandboxId, server] of this.servers.entries()) {
			await server.close();
			console.log(`[SandboxServer] Stopped server for ${sandboxId}`);
		}
		this.servers.clear();

		// Clean up all sandbox directories
		if (fs.existsSync(this.tempDir)) {
			fs.rmSync(this.tempDir, { recursive: true, force: true });
		}
	}

	/**
	 * Get server URL for a sandbox
	 */
	getSandboxUrl(sandboxId: string): string | undefined {
		const server = this.servers.get(sandboxId);
		if (server) {
			const address = server.httpServer?.address();
			if (address && typeof address !== 'string') {
				return `http://localhost:${address.port}`;
			}
		}
		return undefined;
	}
}
