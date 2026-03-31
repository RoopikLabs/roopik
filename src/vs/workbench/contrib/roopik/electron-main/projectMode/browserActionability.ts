/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Browser Actionability
 *
 * Orchestration layer for Playwright-inspired actionability checks.
 * Wraps injected JS scripts with retry logic, progressive backoff,
 * and timeout management.
 *
 * Works with both embedded (executeJavaScript) and external (Runtime.evaluate)
 * modes through a generic evaluate function.
 *
 * Patterns adapted from Playwright (Apache 2.0):
 * - Progressive backoff: [0, 20, 100, 100, 500] ms between retries
 * - Stability via requestAnimationFrame bounding rect comparison
 * - Hit-target verification via elementsFromPoint
 * - Auto scroll into view before actions
 */

import {
	buildCheckActionableScript,
	buildStabilityCheckScript,
	buildScrollIntoViewScript,
	buildQuerySelectorScript,
	buildWaitForSelectorScript,
	buildWaitForReadyStateScript,
} from './browserInjectedScripts.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Function to evaluate JS in the browser context.
 * Both backends provide this: embedded via executeJavaScript, external via Runtime.evaluate.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EvaluateJS = (script: string) => Promise<any>;

export interface ActionabilityResult {
	actionable: boolean;
	reason?: string;
	message?: string;
	tag?: string;
	id?: string;
	className?: string;
	rect?: { x: number; y: number; width: number; height: number };
	obscuredBy?: string;
}

export interface StabilityResult {
	stable: boolean;
	reason?: string;
	message?: string;
	rect?: { x: number; y: number; width: number; height: number };
}

export interface SelectorResult {
	found: boolean;
	count: number;
	elements: Array<{
		tag: string;
		id?: string;
		className?: string;
		text: string;
		rect: { x: number; y: number; width: number; height: number };
		centerX: number;
		centerY: number;
	}>;
}

export interface WaitForSelectorResult {
	found: boolean;
	tag?: string;
	rect?: { x: number; y: number; width: number; height: number };
	centerX?: number;
	centerY?: number;
	reason?: string;
	message?: string;
}

export interface ActionabilityOptions {
	/** Timeout in ms. Default: 5000 */
	timeout?: number;
	/** Which checks to perform. Default: all */
	checks?: ('visible' | 'enabled' | 'stable' | 'receivesEvents')[];
	/** Whether to auto-scroll into view. Default: true */
	scrollIntoView?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Progressive backoff intervals (ms) — adapted from Playwright */
const RETRY_INTERVALS = [0, 20, 100, 100, 500];

const DEFAULT_TIMEOUT = 5000;

// ============================================================================
// Core Actionability Functions
// ============================================================================

/**
 * Wait for element at given coordinates to be actionable.
 * Performs visibility, enabled, stability, and hit-target checks with retry.
 *
 * @returns ActionabilityResult when element is actionable
 * @throws Error if timeout exceeded
 */
export async function waitForActionable(
	evaluate: EvaluateJS,
	x: number,
	y: number,
	options: ActionabilityOptions = {}
): Promise<ActionabilityResult> {
	const timeout = options.timeout ?? DEFAULT_TIMEOUT;
	const doScroll = options.scrollIntoView ?? true;
	const start = Date.now();
	let lastResult: ActionabilityResult | null = null;
	let attempt = 0;

	while (Date.now() - start < timeout) {
		// Progressive backoff
		if (attempt > 0) {
			const delay = RETRY_INTERVALS[Math.min(attempt - 1, RETRY_INTERVALS.length - 1)];
			if (delay > 0) {
				await sleep(delay);
			}
		}

		// Check actionability
		try {
			const result: ActionabilityResult = await evaluate(buildCheckActionableScript(x, y));

			if (!result) {
				attempt++;
				continue;
			}

			if (!result.actionable) {
				lastResult = result;

				// Auto-scroll on first attempt if element exists but is obscured
				if (doScroll && attempt === 0 && result.reason === 'obscured') {
					try {
						await evaluate(buildScrollIntoViewScript(x, y));
					} catch { /* ignore scroll errors */ }
				}

				attempt++;
				continue;
			}

			// Element is actionable — check stability if requested
			const checks = options.checks ?? ['visible', 'enabled', 'stable', 'receivesEvents'];
			if (checks.includes('stable')) {
				const remaining = timeout - (Date.now() - start);
				if (remaining > 0) {
					try {
						const stability: StabilityResult = await evaluate(
							buildStabilityCheckScript(x, y, Math.min(remaining, 3000))
						);
						if (!stability.stable) {
							lastResult = {
								actionable: false,
								reason: 'unstable',
								message: stability.message || 'Element is still animating'
							};
							attempt++;
							continue;
						}
					} catch {
						// Stability check failed — proceed anyway (best effort)
					}
				}
			}

			return result;
		} catch {
			// Script execution failed (page navigating, etc.)
			attempt++;
			continue;
		}
	}

	// Timeout — return last known state
	if (lastResult) {
		throw new Error(
			`Element not actionable after ${timeout}ms: ${lastResult.message || lastResult.reason || 'unknown'}`
		);
	}
	throw new Error(`No element found at (${x}, ${y}) after ${timeout}ms`);
}

/**
 * Query elements using smart selectors (text=, role=, css=, xpath=, id=, data-testid=).
 * Shadow DOM piercing for CSS selectors.
 */
export async function querySelector(
	evaluate: EvaluateJS,
	selector: string,
	maxResults: number = 10
): Promise<SelectorResult> {
	return evaluate(buildQuerySelectorScript(selector, maxResults));
}

/**
 * Wait for a CSS selector to appear in the DOM and become visible.
 * Uses MutationObserver + polling.
 */
export async function waitForSelector(
	evaluate: EvaluateJS,
	selector: string,
	timeoutMs: number = 5000
): Promise<WaitForSelectorResult> {
	return evaluate(buildWaitForSelectorScript(selector, timeoutMs));
}

/**
 * Wait for page to reach a specific ready state.
 * 'interactive' = DOM parsed, 'complete' = all resources loaded.
 */
export async function waitForReadyState(
	evaluate: EvaluateJS,
	targetState: 'interactive' | 'complete',
	timeoutMs: number = 10000
): Promise<{ ready: boolean; readyState: string; reason?: string }> {
	return evaluate(buildWaitForReadyStateScript(targetState, timeoutMs));
}

/**
 * Scroll element at coordinates into view.
 */
export async function scrollIntoView(
	evaluate: EvaluateJS,
	x: number,
	y: number
): Promise<boolean> {
	return evaluate(buildScrollIntoViewScript(x, y));
}

// ============================================================================
// NetworkIdle Tracker
// ============================================================================

/**
 * Tracks inflight network requests and determines network-idle state.
 * NetworkIdle = no inflight requests for 500ms (Playwright's definition).
 *
 * Used by CDPMonitorService — attach to Network.requestWillBeSent and
 * Network.responseReceived / Network.loadingFailed / Network.loadingFinished events.
 */
export class NetworkIdleTracker {
	private inflightRequests = new Set<string>();
	private idleTimer: ReturnType<typeof setTimeout> | null = null;
	private _isIdle = true;
	private idleResolvers: Array<() => void> = [];

	/** Threshold in ms to consider network idle. Playwright uses 500ms. */
	private readonly threshold: number;

	constructor(thresholdMs: number = 500) {
		this.threshold = thresholdMs;
	}

	/** Call when a new request starts */
	requestStarted(requestId: string): void {
		this.inflightRequests.add(requestId);
		this._isIdle = false;
		if (this.idleTimer) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
	}

	/** Call when a request finishes (success, failure, or cancelled) */
	requestFinished(requestId: string): void {
		this.inflightRequests.delete(requestId);
		if (this.inflightRequests.size === 0 && !this.idleTimer) {
			this.idleTimer = setTimeout(() => {
				this._isIdle = true;
				this.idleTimer = null;
				// Resolve all waiters
				for (const resolve of this.idleResolvers) {
					resolve();
				}
				this.idleResolvers = [];
			}, this.threshold);
		}
	}

	/** Reset on page navigation */
	reset(): void {
		this.inflightRequests.clear();
		if (this.idleTimer) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
		this._isIdle = true;
		// Resolve all waiters since we're starting fresh
		for (const resolve of this.idleResolvers) {
			resolve();
		}
		this.idleResolvers = [];
	}

	/** Whether the network is currently idle */
	get isIdle(): boolean {
		return this._isIdle;
	}

	/** Number of inflight requests */
	get inflightCount(): number {
		return this.inflightRequests.size;
	}

	/**
	 * Wait for network to become idle.
	 * Resolves immediately if already idle, otherwise waits.
	 */
	waitForIdle(timeoutMs: number = 10000): Promise<{ idle: boolean; inflightCount: number }> {
		if (this._isIdle) {
			return Promise.resolve({ idle: true, inflightCount: 0 });
		}

		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				// Remove from resolvers
				const idx = this.idleResolvers.indexOf(onIdle);
				if (idx >= 0) { this.idleResolvers.splice(idx, 1); }
				resolve({ idle: false, inflightCount: this.inflightRequests.size });
			}, timeoutMs);

			const onIdle = () => {
				clearTimeout(timer);
				resolve({ idle: true, inflightCount: 0 });
			};

			this.idleResolvers.push(onIdle);
		});
	}

	dispose(): void {
		if (this.idleTimer) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}
		this.idleResolvers = [];
		this.inflightRequests.clear();
	}
}

// ============================================================================
// Utilities
// ============================================================================

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}
