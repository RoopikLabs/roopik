/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * External Browser Backend
 *
 * Implements IBrowserBackend using an external Chrome instance controlled via CDP (WebSocket).
 * Chrome is launched with --remote-debugging-port and controlled through the DevTools Protocol.
 *
 * Architecture:
 *   1. ChromeLauncher spawns Chrome with --remote-debugging-port=<port>
 *   2. Connect to CDP WebSocket (ws://127.0.0.1:<port>/devtools/page/<id>)
 *   3. All IBrowserBackend methods map to CDP commands over WebSocket
 *
 * This backend is selected when roopik.browser.mode === 'external'.
 */

import { spawn, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir, platform } from 'os';
import { Emitter, type Event } from '../../../../../base/common/event.js';
import type { IBrowserBackend, ScreenshotWithMetadata } from './browserBackend.js';
import type { NavigationState, NavigationStateChangedEvent, DevToolsClosedEvent } from '../../common/projectMode/types.js';
import type { GetElementStylesRequest, GetElementStylesResult } from '../../common/cssResolvers/types.js';

// WebSocket type (from 'ws' package, loaded via dynamic import)
interface WsWebSocket {
	readyState: number;
	send(data: string): void;
	close(code?: number, reason?: string): void;
	on(event: string, listener: (...args: unknown[]) => void): void;
}

// Lazy-loaded ws module
let wsModule: { default: new (url: string) => WsWebSocket } | null = null;
async function getWsConstructor(): Promise<new (url: string) => WsWebSocket> {
	if (!wsModule) {
		wsModule = await import('ws') as typeof wsModule;
	}
	return wsModule!.default;
}

// ============================================================================
// Chrome Launcher
// ============================================================================

/** Find Chrome/Chromium executable on the system */
function findChromePath(customPath?: string): string {
	if (customPath && existsSync(customPath)) {
		return customPath;
	}

	const os = platform();

	if (os === 'win32') {
		const candidates = [
			join(process.env['PROGRAMFILES'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
			join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
			join(process.env['LOCALAPPDATA'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
		];
		for (const p of candidates) {
			if (existsSync(p)) { return p; }
		}
	} else if (os === 'darwin') {
		const candidates = [
			'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
			'/Applications/Chromium.app/Contents/MacOS/Chromium',
		];
		for (const p of candidates) {
			if (existsSync(p)) { return p; }
		}
	} else {
		// Linux
		const candidates = [
			'/usr/bin/google-chrome',
			'/usr/bin/google-chrome-stable',
			'/usr/bin/chromium-browser',
			'/usr/bin/chromium',
			'/snap/bin/chromium',
		];
		for (const p of candidates) {
			if (existsSync(p)) { return p; }
		}
	}

	throw new Error('Chrome not found. Set roopik.browser.externalChromePath in settings.');
}

// ============================================================================
// CDP Connection (raw WebSocket)
// ============================================================================

interface CDPTarget {
	id: string;
	type: string;
	title: string;
	url: string;
	webSocketDebuggerUrl: string;
}

/** CDP session over a single WebSocket connection */
class CDPSession {
	private ws: WsWebSocket | null = null;
	private messageId = 0;
	private pendingCallbacks = new Map<number, { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }>();
	private eventListeners: Array<(method: string, params: unknown) => void> = [];
	private closeListeners: Array<() => void> = [];
	private _connected = false;

	get connected(): boolean { return this._connected; }

	async connect(wsUrl: string): Promise<void> {
		const WsConstructor = await getWsConstructor();
		return new Promise((resolve, reject) => {
			this.ws = new WsConstructor(wsUrl);

			this.ws.on('open', () => {
				this._connected = true;
				resolve();
			});

			this.ws.on('error', (err: unknown) => {
				this._connected = false;
				reject(err);
			});

			this.ws.on('close', () => {
				this._connected = false;
				// Notify close listeners (Chrome tab/window closed)
				for (const cb of this.closeListeners) {
					try { cb(); } catch { /* ignore */ }
				}
			});

			this.ws.on('message', (data: unknown) => {
				try {
					const msg = JSON.parse(String(data));
					if (msg.id !== undefined) {
						// Response to a command
						const cb = this.pendingCallbacks.get(msg.id);
						if (cb) {
							this.pendingCallbacks.delete(msg.id);
							if (msg.error) {
								cb.reject(new Error(msg.error.message || 'CDP error'));
							} else {
								cb.resolve(msg.result || {});
							}
						}
					} else if (msg.method) {
						// CDP event
						for (const listener of this.eventListeners) {
							listener(msg.method, msg.params);
						}
					}
				} catch {
					// ignore parse errors
				}
			});
		});
	}

	/** Register a callback for when the WebSocket closes */
	onClose(callback: () => void): void {
		this.closeListeners.push(callback);
	}

	async send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
		if (!this.ws || !this._connected) {
			throw new Error('CDP session not connected');
		}

		const id = ++this.messageId;
		return new Promise((resolve, reject) => {
			this.pendingCallbacks.set(id, { resolve, reject });
			this.ws!.send(JSON.stringify({ id, method, params: params || {} }));

			// Timeout after 30s
			setTimeout(() => {
				if (this.pendingCallbacks.has(id)) {
					this.pendingCallbacks.delete(id);
					reject(new Error(`CDP command timed out: ${method}`));
				}
			}, 30000);
		});
	}

	addListener(callback: (method: string, params: unknown) => void): () => void {
		this.eventListeners.push(callback);
		return () => {
			const idx = this.eventListeners.indexOf(callback);
			if (idx >= 0) { this.eventListeners.splice(idx, 1); }
		};
	}

	disconnect(): void {
		this._connected = false;
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
		// Reject all pending
		for (const [, cb] of this.pendingCallbacks) {
			cb.reject(new Error('CDP session disconnected'));
		}
		this.pendingCallbacks.clear();
		this.eventListeners = [];
		this.closeListeners = [];
	}
}

// ============================================================================
// External Browser Backend
// ============================================================================

export class ExternalBrowserBackend implements IBrowserBackend {

	// Chrome process
	private chromeProcess: ChildProcess | null = null;
	private readonly cdpPort: number;
	private readonly chromePath: string;
	private readonly profilePath: string;

	// Browser-level CDP session (monitors all targets/tabs)
	private browserSession: CDPSession | null = null;

	// Page tracking (pageId → CDPSession)
	// Also maps CDP targetId → pageId for target event lookups
	private readonly pages = new Map<number, { session: CDPSession; target: CDPTarget }>();
	private readonly targetIdToPageId = new Map<string, number>();
	private activePage: number | undefined;
	private nextPageId = 1;

	// Viewport tracking
	private readonly viewportSizes = new Map<number, { width: number; height: number }>();

	// Events
	private readonly _onBrowserViewCreated = new Emitter<{ browserViewId: number }>();
	readonly onBrowserViewCreated: Event<{ browserViewId: number }> = this._onBrowserViewCreated.event;

	private readonly _onBrowserViewDestroyed = new Emitter<{ browserViewId: number }>();
	readonly onBrowserViewDestroyed: Event<{ browserViewId: number }> = this._onBrowserViewDestroyed.event;

	private readonly _onNavigationStateChanged = new Emitter<NavigationStateChangedEvent>();
	readonly onNavigationStateChanged: Event<NavigationStateChangedEvent> = this._onNavigationStateChanged.event;

	private readonly _onDevToolsClosed = new Emitter<DevToolsClosedEvent>();
	readonly onDevToolsClosed: Event<DevToolsClosedEvent> = this._onDevToolsClosed.event;

	constructor(cdpPort: number = 9222, customChromePath?: string) {
		this.cdpPort = cdpPort;
		this.chromePath = findChromePath(customChromePath);
		this.profilePath = join(homedir(), '.roopik', 'browser-profile');
	}

	// ========================================================================
	// Lifecycle
	// ========================================================================

	getActiveBrowserViewId(): number | undefined {
		// Check if the active session is still alive
		if (this.activePage !== undefined) {
			const page = this.pages.get(this.activePage);
			if (!page || !page.session.connected) {
				// Session is dead — clean up stale state
				this.cleanupDeadSessions();
				return undefined;
			}
		}
		return this.activePage;
	}

	requestBrowserOpen(url?: string): void {
		this.launchOrConnect(url).catch(err => {
			console.error('[ExternalBrowser] Failed to launch:', err);
		});
	}

	requestBrowserClose(): void {
		this.closeActivePage().catch(err => {
			console.error('[ExternalBrowser] Failed to close page:', err);
			// Fallback: just disconnect our sessions (don't kill Chrome)
			this.disconnectAll();
		});
	}

	/** Remove pages whose CDP sessions have disconnected */
	private cleanupDeadSessions(): void {
		for (const [pageId, page] of this.pages) {
			if (!page.session.connected) {
				this.removePage(pageId);
			}
		}
		if (this.pages.size === 0) {
			this.activePage = undefined;
			this.chromeProcess = null;
		}
	}

	// ========================================================================
	// Navigation
	// ========================================================================

	async navigate(browserViewId: number, url: string): Promise<void> {
		const session = this.getSession(browserViewId);
		await session.send('Page.navigate', { url });
	}

	async reload(browserViewId: number, ignoreCache?: boolean): Promise<void> {
		const session = this.getSession(browserViewId);
		await session.send('Page.reload', { ignoreCache: ignoreCache ?? false });
	}

	async getNavigationState(browserViewId: number): Promise<NavigationState> {
		const session = this.getSession(browserViewId);

		// Get current URL and title via Runtime.evaluate
		const [urlResult, titleResult, historyResult] = await Promise.all([
			session.send('Runtime.evaluate', { expression: 'window.location.href' }),
			session.send('Runtime.evaluate', { expression: 'document.title' }),
			session.send('Page.getNavigationHistory'),
		]);

		const entries = (historyResult as { entries?: unknown[] }).entries || [];
		const currentIndex = (historyResult as { currentIndex?: number }).currentIndex ?? 0;

		return {
			url: (urlResult as { result?: { value?: string } }).result?.value || '',
			title: (titleResult as { result?: { value?: string } }).result?.value || '',
			isLoading: false,
			canGoBack: currentIndex > 0,
			canGoForward: currentIndex < entries.length - 1,
		};
	}

	// ========================================================================
	// Screenshot
	// ========================================================================

	async takeScreenshotWithMetadata(browserViewId: number): Promise<ScreenshotWithMetadata> {
		const session = this.getSession(browserViewId);

		// Get layout metrics for dimensions
		const metrics = await session.send('Page.getLayoutMetrics') as {
			cssLayoutViewport?: { clientWidth?: number; clientHeight?: number };
		};

		const width = metrics.cssLayoutViewport?.clientWidth ?? 1280;
		const height = metrics.cssLayoutViewport?.clientHeight ?? 720;

		// Capture screenshot
		const result = await session.send('Page.captureScreenshot', {
			format: 'png',
			quality: 100,
		}) as { data?: string };

		return {
			image: `data:image/png;base64,${result.data || ''}`,
			width,
			height,
			devicePixelRatio: 1,
		};
	}

	// ========================================================================
	// Input
	// ========================================================================

	async sendMouseEvent(browserViewId: number, action: string, x: number, y: number): Promise<void> {
		const session = this.getSession(browserViewId);

		switch (action) {
			case 'click':
				await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
				await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
				break;
			case 'double_click':
				await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 2 });
				await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 2 });
				break;
			case 'right_click':
				await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'right', clickCount: 1 });
				await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'right', clickCount: 1 });
				break;
			case 'hover':
				await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
				break;
		}
	}

	async sendTypeEvent(browserViewId: number, text: string): Promise<void> {
		const session = this.getSession(browserViewId);
		for (const char of text) {
			await session.send('Input.dispatchKeyEvent', { type: 'char', text: char });
		}
	}

	async sendKeyEvent(browserViewId: number, key: string, modifiers?: string[]): Promise<void> {
		const session = this.getSession(browserViewId);

		let modifierFlags = 0;
		if (modifiers?.includes('Alt')) { modifierFlags |= 1; }
		if (modifiers?.includes('Control') || modifiers?.includes('Ctrl')) { modifierFlags |= 2; }
		if (modifiers?.includes('Meta') || modifiers?.includes('Cmd')) { modifierFlags |= 4; }
		if (modifiers?.includes('Shift')) { modifierFlags |= 8; }

		await session.send('Input.dispatchKeyEvent', {
			type: 'keyDown',
			key,
			modifiers: modifierFlags,
		});
		await session.send('Input.dispatchKeyEvent', {
			type: 'keyUp',
			key,
			modifiers: modifierFlags,
		});
	}

	async sendScrollEvent(browserViewId: number, deltaX: number, deltaY: number, x?: number, y?: number): Promise<void> {
		const session = this.getSession(browserViewId);
		await session.send('Input.dispatchMouseEvent', {
			type: 'mouseWheel',
			x: x ?? 0,
			y: y ?? 0,
			deltaX,
			deltaY,
		});
	}

	// ========================================================================
	// Script Execution
	// ========================================================================

	async executeScript(browserViewId: number, script: string): Promise<unknown> {
		const session = this.getSession(browserViewId);
		const result = await session.send('Runtime.evaluate', {
			expression: script,
			returnByValue: true,
			awaitPromise: true,
		}) as { result?: { value?: unknown } };
		return result.result?.value;
	}

	// ========================================================================
	// CSS Inspection
	// ========================================================================

	async getElementStyles(_request: GetElementStylesRequest): Promise<{
		success: boolean;
		data?: GetElementStylesResult;
		error?: string;
	}> {
		// CSS source-map inspection requires the embedded browser's build pipeline.
		// External Chrome doesn't have access to Vite's source maps in the same way.
		// TODO: Implement via CDP CSS domain + source map fetching
		return {
			success: false,
			error: 'CSS inspection with source maps is not yet supported in external browser mode. Use embedded mode for this feature.',
		};
	}

	// ========================================================================
	// CDP (low-level) — passthrough to session
	// ========================================================================

	async attachDebugger(_browserViewId: number): Promise<void> {
		// In external mode, CDP is always attached (it's our connection method)
		// No-op — the session is already a CDP connection
	}

	async sendCDPCommand(browserViewId: number, method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
		const session = this.getSession(browserViewId);
		return session.send(method, params);
	}

	// ========================================================================
	// Viewport
	// ========================================================================

	getViewportSize(browserViewId: number): { width: number; height: number } | undefined {
		return this.viewportSizes.get(browserViewId);
	}

	// ========================================================================
	// CDP Event Listener
	// ========================================================================

	onCDPEvent(browserViewId: number, callback: (method: string, params: unknown) => void): () => void {
		const page = this.pages.get(browserViewId);
		if (!page) {
			return () => { /* noop */ };
		}
		return page.session.addListener(callback);
	}

	// ========================================================================
	// Internal: Chrome Launch & Connect
	// ========================================================================

	/**
	 * Launch Chrome or re-attach to an existing instance.
	 *
	 * Flow:
	 * 1. If we have live sessions → just navigate
	 * 2. Try to attach to Chrome already running on the CDP port
	 * 3. If nothing is running → spawn Chrome
	 */
	private async launchOrConnect(url?: string): Promise<void> {
		// Clean up any dead sessions first
		this.cleanupDeadSessions();

		// If we have a live active page, just navigate
		if (this.activePage !== undefined) {
			const page = this.pages.get(this.activePage);
			if (page?.session.connected) {
				if (url) {
					await this.navigate(this.activePage, url);
				}
				return;
			}
		}

		// Try to attach to Chrome already running on the CDP port
		// (from a previous session, or user-launched Chrome with --remote-debugging-port)
		const attached = await this.tryAttachToExisting();
		if (attached) {
			console.log(`[ExternalBrowser] Re-attached to existing Chrome on port ${this.cdpPort}`);
			if (url && this.activePage !== undefined) {
				await this.navigate(this.activePage, url);
			}
			return;
		}

		// Nothing running — launch Chrome
		console.log(`[ExternalBrowser] Launching Chrome: ${this.chromePath}`);
		const args = [
			`--remote-debugging-port=${this.cdpPort}`,
			`--user-data-dir=${this.profilePath}`,
			'--no-first-run',
			'--no-default-browser-check',
			'--disable-fre',
			'--disable-features=OfferMigrationToDiceUsers',
		];

		if (url) {
			args.push(url);
		}

		this.chromeProcess = spawn(this.chromePath, args, {
			detached: true,
			stdio: 'ignore',
		});

		this.chromeProcess.unref();
		this.chromeProcess.on('exit', () => {
			console.log('[ExternalBrowser] Chrome process exited');
			this.chromeProcess = null;
			for (const [pageId] of this.pages) {
				this.removePage(pageId);
			}
			this.activePage = undefined;
		});

		// Wait for CDP to become ready
		await this.waitForCDP();

		// Connect to pages
		await this.discoverAndConnectPages();
	}

	/** Try to attach to Chrome already running on the CDP port */
	private async tryAttachToExisting(): Promise<boolean> {
		try {
			const resp = await fetch(`http://127.0.0.1:${this.cdpPort}/json/version`);
			if (!resp.ok) { return false; }

			// Chrome is running — discover and connect to its pages
			await this.discoverAndConnectPages();
			return this.activePage !== undefined;
		} catch {
			return false;
		}
	}

	/** Poll CDP endpoint until Chrome is ready */
	private async waitForCDP(): Promise<void> {
		const maxAttempts = 30;
		const delay = 200;

		for (let i = 0; i < maxAttempts; i++) {
			try {
				const resp = await fetch(`http://127.0.0.1:${this.cdpPort}/json/version`);
				if (resp.ok) { return; }
			} catch {
				// Not ready yet
			}
			await new Promise(r => setTimeout(r, delay));
		}
		throw new Error(`Chrome CDP not ready after ${maxAttempts * delay}ms on port ${this.cdpPort}`);
	}

	/** Discover open tabs and connect CDP sessions */
	private async discoverAndConnectPages(): Promise<void> {
		const resp = await fetch(`http://127.0.0.1:${this.cdpPort}/json/list`);
		const targets: CDPTarget[] = await resp.json() as CDPTarget[];

		// Track which targets we already have sessions for (by wsUrl)
		const existingWsUrls = new Set<string>();
		for (const [, page] of this.pages) {
			existingWsUrls.add(page.target.webSocketDebuggerUrl);
		}

		for (const target of targets) {
			if (target.type !== 'page') { continue; }
			// Skip targets we're already connected to
			if (existingWsUrls.has(target.webSocketDebuggerUrl)) { continue; }

			const pageId = this.nextPageId++;
			const session = new CDPSession();

			try {
				await session.connect(target.webSocketDebuggerUrl);
			} catch (err) {
				console.warn(`[ExternalBrowser] Failed to connect to page ${target.url}:`, err);
				continue;
			}

			// Enable required CDP domains
			await Promise.all([
				session.send('Page.enable'),
				session.send('Runtime.enable'),
				session.send('Network.enable'),
			]);

			// Track viewport via CDP
			const layoutResult = await session.send('Page.getLayoutMetrics') as {
				cssLayoutViewport?: { clientWidth?: number; clientHeight?: number };
			};
			if (layoutResult.cssLayoutViewport) {
				this.viewportSizes.set(pageId, {
					width: layoutResult.cssLayoutViewport.clientWidth ?? 1280,
					height: layoutResult.cssLayoutViewport.clientHeight ?? 720,
				});
			}

			// Listen for navigation events
			session.addListener((method, params) => {
				if (method === 'Page.frameNavigated') {
					const frame = (params as { frame?: { url?: string } }).frame;
					if (frame?.url) {
						this._onNavigationStateChanged.fire({
							browserViewId: pageId,
							url: frame.url,
							title: '',
							isLoading: true,
							canGoBack: false,
							canGoForward: false,
						});
					}
				}
				if (method === 'Page.loadEventFired') {
					this.getNavigationState(pageId).then(state => {
						this._onNavigationStateChanged.fire({
							browserViewId: pageId,
							...state,
						});
					}).catch(() => { /* ignore */ });
				}
			});

			// Detect WebSocket close → page/Chrome was closed by user
			session.onClose(() => {
				console.log(`[ExternalBrowser] CDP session closed for page ${pageId} (${target.url})`);
				this.removePage(pageId);
			});

			this.pages.set(pageId, { session, target });
			this.activePage = pageId;
			this._onBrowserViewCreated.fire({ browserViewId: pageId });
			console.log(`[ExternalBrowser] Connected to page ${pageId}: ${target.url}`);
		}
	}

	private removePage(pageId: number): void {
		const page = this.pages.get(pageId);
		if (page) {
			page.session.disconnect();
			this.pages.delete(pageId);
			this.viewportSizes.delete(pageId);
			this._onBrowserViewDestroyed.fire({ browserViewId: pageId });

			// Update active page
			if (this.activePage === pageId) {
				const remaining = Array.from(this.pages.keys());
				this.activePage = remaining.length > 0 ? remaining[remaining.length - 1] : undefined;
			}
		}
	}

	private getSession(browserViewId: number): CDPSession {
		const page = this.pages.get(browserViewId);
		if (!page) {
			throw new Error(`No CDP session for browserViewId: ${browserViewId}`);
		}
		return page.session;
	}

	/**
	 * Close the active page via CDP (actually closes the tab in Chrome).
	 * Does NOT kill Chrome — it's the user's browser.
	 */
	private async closeActivePage(): Promise<void> {
		if (this.activePage === undefined) { return; }

		const page = this.pages.get(this.activePage);
		if (page?.session.connected) {
			try {
				// CDP Target.closeTarget actually closes the tab
				const targetId = page.target.id;
				// Use the Browser domain to close the target
				await page.session.send('Page.close');
			} catch {
				// Page.close might not be available, try via HTTP endpoint
				try {
					await fetch(`http://127.0.0.1:${this.cdpPort}/json/close/${page.target.id}`);
				} catch {
					// Last resort: just disconnect
				}
			}
		}

		// Clean up our state (WebSocket onClose will also fire)
		this.removePage(this.activePage);
	}

	/** Disconnect all CDP sessions without killing Chrome */
	private disconnectAll(): void {
		for (const [pageId] of this.pages) {
			this.removePage(pageId);
		}
		this.activePage = undefined;
	}
}
