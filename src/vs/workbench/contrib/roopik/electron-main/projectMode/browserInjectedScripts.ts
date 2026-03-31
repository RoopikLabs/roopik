/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Browser Injected Scripts
 *
 * JavaScript code injected into the browser context for actionability checks,
 * smart selectors, and element state queries. Inspired by Playwright's approach
 * (Apache 2.0) — all checks run as injected JS via Runtime.evaluate or
 * webContents.executeJavaScript, working with both embedded and external modes.
 *
 * Key pattern: inject JS → poll via requestAnimationFrame → return when condition met
 */

// ============================================================================
// Actionability Check Script
// ============================================================================

/**
 * Checks if an element at given coordinates is actionable.
 * Returns element info + actionability state.
 *
 * Checks performed (modeled after Playwright):
 * 1. Element exists at coordinates
 * 2. Visible (has non-zero bounding rect)
 * 3. Enabled (not disabled/aria-disabled)
 * 4. Receives events (is topmost at click point, not obscured)
 */
export function buildCheckActionableScript(x: number, y: number): string {
	return `(function() {
		const x = ${x}, y = ${y};
		const el = document.elementFromPoint(x, y);
		if (!el) {
			return { actionable: false, reason: 'no_element', message: 'No element found at coordinates (' + x + ', ' + y + ')' };
		}

		// Check visible (non-zero bounding rect)
		const rect = el.getBoundingClientRect();
		if (rect.width === 0 && rect.height === 0) {
			return { actionable: false, reason: 'not_visible', message: 'Element has zero size', tag: el.tagName };
		}

		// Check visibility CSS — Playwright considers opacity:0 as visible (still receives pointer events)
		const style = window.getComputedStyle(el);
		if (style.visibility === 'hidden' || style.display === 'none') {
			return { actionable: false, reason: 'hidden', message: 'Element is hidden via CSS', tag: el.tagName };
		}

		// Check enabled (not disabled, not aria-disabled)
		if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') {
			return { actionable: false, reason: 'disabled', message: 'Element is disabled', tag: el.tagName };
		}
		// Walk up tree for inherited aria-disabled
		let parent = el.parentElement;
		while (parent) {
			if (parent.getAttribute('aria-disabled') === 'true') {
				return { actionable: false, reason: 'disabled', message: 'Element has disabled ancestor', tag: el.tagName };
			}
			parent = parent.parentElement;
		}

		// Check receives events — hit-target verification (Playwright's key protection)
		// We find the element's center point, then check what elementFromPoint returns there.
		// If an overlay/modal/tooltip is covering it, elementFromPoint returns the overlay instead.
		const centerX = rect.x + rect.width / 2;
		const centerY = rect.y + rect.height / 2;
		const hitEl = document.elementFromPoint(centerX, centerY);
		const receivesEvents = hitEl === el || el.contains(hitEl) || (hitEl && hitEl.contains(el));

		if (!receivesEvents) {
			const hitTag = hitEl ? hitEl.tagName.toLowerCase() : 'unknown';
			const hitId = hitEl && hitEl.id ? '#' + hitEl.id : '';
			const hitClass = hitEl && hitEl.className && typeof hitEl.className === 'string'
				? '.' + hitEl.className.split(' ').filter(Boolean).join('.') : '';
			return {
				actionable: false, reason: 'obscured',
				message: 'Element <' + el.tagName.toLowerCase() + '> is obscured by <' + hitTag + hitId + hitClass + '> at center (' + Math.round(centerX) + ', ' + Math.round(centerY) + ')',
				tag: el.tagName.toLowerCase(), obscuredBy: hitTag + hitId + hitClass
			};
		}

		return {
			actionable: true,
			tag: el.tagName.toLowerCase(),
			id: el.id || undefined,
			className: (typeof el.className === 'string' ? el.className : '') || undefined,
			rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
		};
	})()`;
}

// ============================================================================
// Stability Check Script (requestAnimationFrame-based)
// ============================================================================

/**
 * Checks if the element at given coordinates is stable (not animating).
 * Compares bounding rect across 2 consecutive animation frames.
 * Returns a Promise that resolves when stable or times out.
 *
 * Playwright uses stableRafCount=1 for Chromium → 2 consecutive equal frames.
 */
export function buildStabilityCheckScript(x: number, y: number, timeoutMs: number = 3000): string {
	return `new Promise((resolve) => {
		const x = ${x}, y = ${y};
		const timeout = ${timeoutMs};
		const start = performance.now();
		let lastRect = null;
		let stableCount = 0;

		function check() {
			if (performance.now() - start > timeout) {
				resolve({ stable: false, reason: 'timeout', message: 'Element did not stabilize within ' + timeout + 'ms' });
				return;
			}

			const el = document.elementFromPoint(x, y);
			if (!el) {
				resolve({ stable: false, reason: 'no_element', message: 'No element at coordinates' });
				return;
			}

			const r = el.getBoundingClientRect();
			const rect = { x: r.x, y: r.y, width: r.width, height: r.height };

			if (lastRect) {
				const same = rect.x === lastRect.x && rect.y === lastRect.y
					&& rect.width === lastRect.width && rect.height === lastRect.height;
				if (!same) {
					stableCount = 0;
				} else if (++stableCount >= 1) {
					resolve({ stable: true, rect: rect });
					return;
				}
			}
			lastRect = rect;
			requestAnimationFrame(check);
		}
		requestAnimationFrame(check);
	})`;
}

// ============================================================================
// Scroll Into View Script
// ============================================================================

/**
 * Scrolls the element at given coordinates into view if needed.
 */
export function buildScrollIntoViewScript(x: number, y: number): string {
	return `(function() {
		const el = document.elementFromPoint(${x}, ${y});
		if (el && el.scrollIntoViewIfNeeded) {
			el.scrollIntoViewIfNeeded({ block: 'center', inline: 'center' });
			return true;
		} else if (el) {
			el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
			return true;
		}
		return false;
	})()`;
}

// ============================================================================
// Smart Selector Scripts
// ============================================================================

/**
 * Universal selector engine supporting text=, role=, css=, xpath= prefixes.
 * If no prefix, defaults to CSS selector.
 * Pierces shadow DOM for CSS selectors.
 * Returns { found, count, elements: [{tag, id, className, rect, text}] }
 */
export function buildQuerySelectorScript(selector: string, maxResults: number = 10): string {
	const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
	return `(function() {
		const selector = '${escapedSelector}';
		const maxResults = ${maxResults};

		// Parse selector prefix
		let engine = 'css';
		let query = selector;
		const prefixMatch = selector.match(/^(text|role|css|xpath|id|data-testid)=(.+)$/);
		if (prefixMatch) {
			engine = prefixMatch[1];
			query = prefixMatch[2];
		}

		function queryShadowDom(root, css) {
			let results = [...root.querySelectorAll(css)];
			if (root.shadowRoot) {
				results = results.concat(queryShadowDom(root.shadowRoot, css));
			}
			for (const el of root.querySelectorAll('*')) {
				if (el.shadowRoot) {
					results = results.concat(queryShadowDom(el.shadowRoot, css));
				}
			}
			return results;
		}

		function normalizeText(text) {
			return text.replace(/\\s+/g, ' ').trim();
		}

		function getVisibleText(el) {
			// Playwright considers opacity:0 elements as visible (they receive pointer events)
			// Only skip elements with display:none or visibility:hidden
			const style = window.getComputedStyle(el);
			if (style.display === 'none' || style.visibility === 'hidden') return '';
			return el.innerText || el.textContent || '';
		}

		// Compute accessible name per WAI-ARIA spec (simplified)
		function getAccessibleName(el) {
			// 1. aria-labelledby
			const labelledBy = el.getAttribute('aria-labelledby');
			if (labelledBy) {
				const names = labelledBy.split(/\\s+/).map(id => {
					const ref = document.getElementById(id);
					return ref ? normalizeText(ref.textContent || '') : '';
				}).filter(Boolean);
				if (names.length) return names.join(' ');
			}
			// 2. aria-label
			const ariaLabel = el.getAttribute('aria-label');
			if (ariaLabel) return ariaLabel.trim();
			// 3. For inputs: associated label element
			if (el.id) {
				const label = document.querySelector('label[for="' + el.id + '"]');
				if (label) return normalizeText(label.textContent || '');
			}
			// 4. title attribute
			const title = el.getAttribute('title');
			if (title) return title.trim();
			// 5. Text content (for buttons, links, etc.)
			return normalizeText(el.textContent || '');
		}

		let elements = [];

		switch (engine) {
			case 'css':
				elements = queryShadowDom(document, query);
				break;

			case 'text': {
				// Playwright text= semantics:
				// - Quoted string ("Submit") = exact match (after whitespace normalization)
				// - Unquoted string = substring match, case-insensitive
				const isExact = /^["'].*["']$/.test(query);
				const searchText = normalizeText(query.replace(/^["']|["']$/g, ''));
				const searchLower = searchText.toLowerCase();

				const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_ELEMENT);
				let node;
				while ((node = walker.nextNode())) {
					const visibleText = normalizeText(getVisibleText(node));
					if (!visibleText) continue;

					const match = isExact
						? normalizeText(visibleText).toLowerCase() === searchLower
						: visibleText.toLowerCase().includes(searchLower);

					if (match) {
						// Prefer deepest (most specific) matching element
						let hasChildMatch = false;
						for (const child of node.children) {
							const childText = normalizeText(getVisibleText(child));
							if (!childText) continue;
							const childMatch = isExact
								? childText.toLowerCase() === searchLower
								: childText.toLowerCase().includes(searchLower);
							if (childMatch) { hasChildMatch = true; break; }
						}
						if (!hasChildMatch) {
							elements.push(node);
						}
					}
				}
				break;
			}

			case 'role': {
				const roleMatch = query.match(/^([\\w-]+)(?:\\[name=["'](.+?)["']\\])?$/);
				if (!roleMatch) break;
				const targetRole = roleMatch[1];
				const targetName = roleMatch[2];

				// Walk all elements including shadow DOM
				function walkElements(root) {
					const results = [];
					for (const el of root.querySelectorAll('*')) {
						const role = el.getAttribute('role') || getImplicitRole(el);
						if (role !== targetRole) continue;
						if (targetName) {
							const name = getAccessibleName(el);
							if (!name.toLowerCase().includes(targetName.toLowerCase())) continue;
						}
						results.push(el);
						if (el.shadowRoot) results.push(...walkElements(el.shadowRoot));
					}
					return results;
				}
				elements = walkElements(document);
				}
				break;
			}

			case 'xpath': {
				const xresult = document.evaluate(query, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
				for (let i = 0; i < xresult.snapshotLength && i < maxResults; i++) {
					const node = xresult.snapshotItem(i);
					if (node && node.nodeType === Node.ELEMENT_NODE) elements.push(node);
				}
				break;
			}

			case 'id':
				elements = queryShadowDom(document, '[id="' + query + '"]');
				break;

			case 'data-testid':
				elements = queryShadowDom(document, '[data-testid="' + query + '"]');
				break;
		}

		// Helper: get implicit ARIA role from tag
		function getImplicitRole(el) {
			const tag = el.tagName.toLowerCase();
			const type = (el.getAttribute('type') || '').toLowerCase();
			const roleMap = {
				'a[href]': 'link', 'button': 'button', 'h1': 'heading', 'h2': 'heading',
				'h3': 'heading', 'h4': 'heading', 'h5': 'heading', 'h6': 'heading',
				'img': 'img', 'input[checkbox]': 'checkbox', 'input[radio]': 'radio',
				'input[text]': 'textbox', 'input[search]': 'searchbox', 'input[email]': 'textbox',
				'input[password]': 'textbox', 'input[number]': 'spinbutton', 'input[range]': 'slider',
				'input[submit]': 'button', 'input[reset]': 'button', 'nav': 'navigation',
				'select': 'combobox', 'table': 'table', 'textarea': 'textbox',
				'ul': 'list', 'ol': 'list', 'li': 'listitem', 'form': 'form',
				'main': 'main', 'header': 'banner', 'footer': 'contentinfo',
				'aside': 'complementary', 'article': 'article', 'section': 'region',
				'dialog': 'dialog', 'details': 'group', 'summary': 'button',
				'progress': 'progressbar', 'meter': 'meter',
			};
			// Check tag + type for inputs
			if (tag === 'input') return roleMap['input[' + type + ']'] || 'textbox';
			if (tag === 'a' && el.hasAttribute('href')) return 'link';
			return roleMap[tag] || null;
		}

		// Serialize results
		const results = elements.slice(0, maxResults).map(el => {
			const rect = el.getBoundingClientRect();
			return {
				tag: el.tagName.toLowerCase(),
				id: el.id || undefined,
				className: (typeof el.className === 'string' ? el.className : '') || undefined,
				text: (el.innerText || el.textContent || '').trim().substring(0, 100),
				rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
				centerX: rect.x + rect.width / 2,
				centerY: rect.y + rect.height / 2,
			};
		});

		return {
			found: results.length > 0,
			count: elements.length,
			elements: results
		};
	})()`;
}

// ============================================================================
// Wait For Selector Script (polling)
// ============================================================================

/**
 * Waits for a CSS selector to appear in the DOM and become visible.
 * Uses MutationObserver + polling fallback.
 * Returns a Promise that resolves when found or rejects on timeout.
 */
export function buildWaitForSelectorScript(selector: string, timeoutMs: number = 5000): string {
	const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
	return `new Promise((resolve) => {
		const selector = '${escapedSelector}';
		const timeout = ${timeoutMs};
		const start = performance.now();

		function check() {
			const el = document.querySelector(selector);
			if (el) {
				const rect = el.getBoundingClientRect();
				if (rect.width > 0 && rect.height > 0) {
					return {
						found: true,
						tag: el.tagName.toLowerCase(),
						rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
						centerX: rect.x + rect.width / 2,
						centerY: rect.y + rect.height / 2,
					};
				}
			}
			return null;
		}

		// Quick check first
		const immediate = check();
		if (immediate) { resolve(immediate); return; }

		// Use MutationObserver + polling
		let observer;
		const timer = setTimeout(() => {
			if (observer) observer.disconnect();
			resolve({ found: false, reason: 'timeout', message: 'Selector "' + selector + '" not found within ' + timeout + 'ms' });
		}, timeout);

		function tryCheck() {
			const result = check();
			if (result) {
				clearTimeout(timer);
				if (observer) observer.disconnect();
				resolve(result);
			}
		}

		observer = new MutationObserver(tryCheck);
		observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

		// Polling fallback every 200ms (MutationObserver may miss some changes)
		const interval = setInterval(() => {
			if (performance.now() - start > timeout) {
				clearInterval(interval);
				return;
			}
			tryCheck();
		}, 200);

		// Clean up interval when resolved
		const origResolve = resolve;
		resolve = (v) => { clearInterval(interval); origResolve(v); };
	})`;
}

// ============================================================================
// Page Ready State Script
// ============================================================================

/**
 * Returns the current page readiness info.
 */
export const PAGE_READY_STATE_SCRIPT = `(function() {
	return {
		readyState: document.readyState,
		url: window.location.href,
		title: document.title,
	};
})()`;

/**
 * Waits for document.readyState to reach the target state.
 * 'interactive' = DOM parsed, 'complete' = all resources loaded.
 */
export function buildWaitForReadyStateScript(targetState: 'interactive' | 'complete', timeoutMs: number = 10000): string {
	return `new Promise((resolve) => {
		const target = '${targetState}';
		const timeout = ${timeoutMs};

		function stateReached() {
			if (target === 'interactive') {
				return document.readyState === 'interactive' || document.readyState === 'complete';
			}
			return document.readyState === 'complete';
		}

		if (stateReached()) {
			resolve({ ready: true, readyState: document.readyState });
			return;
		}

		const timer = setTimeout(() => {
			document.removeEventListener('readystatechange', handler);
			resolve({ ready: false, readyState: document.readyState, reason: 'timeout' });
		}, timeout);

		function handler() {
			if (stateReached()) {
				clearTimeout(timer);
				document.removeEventListener('readystatechange', handler);
				resolve({ ready: true, readyState: document.readyState });
			}
		}
		document.addEventListener('readystatechange', handler);
	})`;
}
