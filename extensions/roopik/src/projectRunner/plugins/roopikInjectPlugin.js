/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Roopik HTML Injection Plugin
 * Injects click-to-source script into HTML
 *
 * Security: The script is obfuscated at runtime to protect IP when users save pages.
 */

// Clean, readable source code for development
const ROOPIK_INJECT_SCRIPT_SOURCE = `
(function() {
	if (window.parent === window) return;

	document.documentElement.style.display = 'none';

	const EXPECTED_SECRET = 'ROOPIK_IDE_HANDSHAKE_v1';
	let authenticated = false;

	window.addEventListener('message', (event) => {
		const message = event.data;

		if (!authenticated && message.type === 'ROOPIK_HANDSHAKE_SYN' && message.secret === EXPECTED_SECRET) {
			authenticated = true;
			document.documentElement.style.display = '';

			window.parent.postMessage({ type: 'ROOPIK_HANDSHAKE_ACK' }, '*');
			return;
		}
	});

	setTimeout(() => {
		if (!authenticated) {
			document.documentElement.style.display = '';
			document.body.innerHTML = \`
				<div style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#1e1e1e;color:#fff;font-family:system-ui,-apple-system,sans-serif;">
					<div style="text-align:center;max-width:500px;padding:40px;">
						<h1 style="color:#f48771;margin:0 0 20px 0;">🔒 Access Denied</h1>
						<p style="color:#ccc;line-height:1.6;">This Roopik development server can only be viewed inside the IDE.</p>
						<p style="color:#888;font-size:14px;margin-top:20px;">If you're seeing this in the IDE, please reload the preview.</p>
					</div>
				</div>
			\`;
		}
	}, 2000);

	let debugMode = false;

	window.addEventListener('message', (event) => {
		const message = event.data;
		if (message.type === 'roopik-toggle-debug') {
			debugMode = message.enabled;
		} else if (message.type === 'roopik-back') {
			window.history.back();
		} else if (message.type === 'roopik-forward') {
			window.history.forward();
		}
	});

	// Initialize lastUrl - will be set by parent via message
	let lastUrl = location.href;
	let urlTrackingInitialized = false;

	function notifyUrlChange() {
		if (location.href !== lastUrl) {
			lastUrl = location.href;
			window.parent.postMessage({ type: 'roopik-navigate', url: location.href }, '*');
		}
	}

	// Listen for initial URL from parent (source of truth)
	window.addEventListener('message', (event) => {
		const message = event.data;
		if (message.type === 'roopik-init-url' && !urlTrackingInitialized) {
			lastUrl = message.url;
			urlTrackingInitialized = true;
			console.log('[Roopik] Initialized URL tracking with:', lastUrl);
		}
	});

	// Use shorter interval for more responsive URL updates (100ms instead of 500ms)
	setInterval(notifyUrlChange, 100);

	// Listen for navigation events (instant detection)
	window.addEventListener('popstate', notifyUrlChange);

	// Also listen for hashchange for SPAs
	window.addEventListener('hashchange', notifyUrlChange);

	// Track and notify title changes
	let lastTitle = document.title || 'Preview Mode';

	function notifyTitleChange() {
		const currentTitle = document.title || 'Preview Mode';
		if (currentTitle !== lastTitle) {
			lastTitle = currentTitle;
			window.parent.postMessage({
				type: 'roopik-title-change',
				title: currentTitle
			}, '*');
		}
	}

	// Monitor title changes with MutationObserver
	const titleObserver = new MutationObserver(() => {
		notifyTitleChange();
	});

	// Observe title element changes
	const titleElement = document.querySelector('title');
	if (titleElement) {
		titleObserver.observe(titleElement, {
			childList: true,
			characterData: true,
			subtree: true
		});
	}

	// Also observe head for title element addition/removal
	titleObserver.observe(document.head, {
		childList: true,
		subtree: true
	});

	// Send initial title (always send, even if same as default)
	window.parent.postMessage({
		type: 'roopik-title-change',
		title: document.title || 'Preview Mode'
	}, '*');

	const BROWSER_SHORTCUT_KEYS = new Set(['s', 'p', 'o', 'l', 'n', 't', 'w', 'u']);
	const BROWSER_DEVTOOLS_KEYS = ['i', 'j', 'c']; // Ctrl/Cmd + Shift + key

	function notifyShortcutBlocked(reason, detail) {
		try {
			window.parent.postMessage({
				type: 'roopik-browser-shortcut-blocked',
				reason,
				detail
			}, '*');
		} catch (err) {
			console.warn('[Roopik] Failed to notify parent about blocked shortcut:', err);
		}
	}

	window.addEventListener('keydown', (event) => {
		const key = event.key ? event.key.toLowerCase() : '';
		const primaryModifier = event.metaKey || event.ctrlKey;
		const isDevtoolsCombo = primaryModifier && event.shiftKey && BROWSER_DEVTOOLS_KEYS.includes(key);

		if (
			(primaryModifier && BROWSER_SHORTCUT_KEYS.has(key)) ||
			isDevtoolsCombo ||
			event.key === 'F5' ||
			event.key === 'F1'
		) {
			event.preventDefault();
			event.stopPropagation();
			notifyShortcutBlocked('keyboard', { key: event.key, shift: event.shiftKey });
		}

		// Alt + Left/Right navigates history in browser
		if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
			event.preventDefault();
			event.stopPropagation();
			notifyShortcutBlocked('keyboard-navigation', { key: event.key });
		}
	}, true);

	function handleModifierClick(event) {
		const hasCtrlMeta = event.metaKey || event.ctrlKey;
		const hasShift = event.shiftKey;
		const hasAlt = event.altKey;
		const isMiddleClick = event.button === 1;
		const isModifierClick = hasCtrlMeta || hasShift || hasAlt || isMiddleClick;

		if (!isModifierClick) return;

		event.preventDefault();
		event.stopPropagation();

		if (hasCtrlMeta && debugMode) {
			const source = findSourceInfo(event.target);
			if (source) {
				window.parent.postMessage({
					type: 'roopik-click-to-source',
					file: source.fileName,
					line: source.lineNumber,
					column: source.columnNumber,
					endLine: source.endLine, // Multi-line support
					endColumn: source.endColumn, // Multi-line support
					componentName: source.componentName,
					parentContext: source.parentContext // Parent metadata: "ComponentName|tag>parent>grandparent"
				}, '*');
				return;
			}
		}

		notifyShortcutBlocked('mouse', {
			ctrlMeta: hasCtrlMeta,
			shift: hasShift,
			alt: hasAlt,
			button: event.button
		});
	}

	document.addEventListener('click', handleModifierClick, true);
	document.addEventListener('auxclick', handleModifierClick, true);

	function findSourceInfo(element) {
		try {
			if (element.hasAttribute && element.hasAttribute('data-roopik-source')) {
				const sourceData = element.getAttribute('data-roopik-source');
				const parentData = element.hasAttribute('data-roopik-parent')
					? element.getAttribute('data-roopik-parent')
					: null;

				// Get component name from source attribute (e.g., "Link" not "A")
				const componentName = element.hasAttribute('data-roopik-component')
					? element.getAttribute('data-roopik-component')
					: (element.tagName || 'Unknown');

				const parts = sourceData.split(':');
				// New format: filename:startLine:startCol:endLine:endCol (5+ parts)
				// Old format: filename:line:col (3+ parts)
				if (parts.length >= 5) {
					// Multi-line format with start/end
					const fileName = parts.slice(0, -4).join(':');
					const startLine = parseInt(parts[parts.length - 4], 10);
					const startColumn = parseInt(parts[parts.length - 3], 10);
					const endLine = parseInt(parts[parts.length - 2], 10);
					const endColumn = parseInt(parts[parts.length - 1], 10);
					return {
						fileName,
						lineNumber: startLine,
						columnNumber: startColumn,
						endLine,
						endColumn,
						componentName, // From source, not DOM (e.g., "Link" not "A")
						parentContext: parentData // Parent metadata: "ComponentName|section>div>div>Link"
					};
				} else if (parts.length >= 3) {
					// Legacy single-line format (backward compatibility for regex mode)
					const fileName = parts.slice(0, -2).join(':');
					const lineNumber = parseInt(parts[parts.length - 2], 10);
					const columnNumber = parseInt(parts[parts.length - 1], 10);
					return {
						fileName,
						lineNumber,
						columnNumber,
						componentName, // From source, not DOM
						parentContext: parentData // Parent metadata even in legacy mode
					};
				}
			}

			const fiberKey = Object.keys(element).find(key =>
				key.startsWith('__reactFiber') || key.startsWith('_reactFiber')
			);
			if (fiberKey) {
				let fiber = element[fiberKey];
				while (fiber) {
					const source = fiber._debugSource || fiber._source;
					if (source && source.fileName) {
						return {
							fileName: source.fileName,
							lineNumber: source.lineNumber,
							columnNumber: source.columnNumber,
							componentName: getComponentName(fiber)
						};
					}
					fiber = fiber.return;
				}
			}
			return null;
		} catch (error) {
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

	// Don't send initial navigation - let the parent's iframe src be the source of truth
	// Only send navigation updates when user actually navigates (handled by setInterval above)
})();
`;

/**
 * Obfuscate the injection script at runtime
 *
 * Applies professional-grade obfuscation including variable renaming,
 * string encoding, control flow flattening, and anti-debugging protection.
 * Source code remains clean for developers while deployed code is protected.
 */
function obfuscateScript(source) {
	const JavaScriptObfuscator = require('javascript-obfuscator');

	const obfuscationResult = JavaScriptObfuscator.obfuscate(source, {
		compact: true,
		controlFlowFlattening: true,
		controlFlowFlatteningThreshold: 0.75,
		deadCodeInjection: true,
		deadCodeInjectionThreshold: 0.4,
		debugProtection: false,
		debugProtectionInterval: 0,
		disableConsoleOutput: false,
		identifierNamesGenerator: 'hexadecimal',
		log: false,
		numbersToExpressions: true,
		renameGlobals: false,
		selfDefending: false,
		simplify: true,
		splitStrings: true,
		splitStringsChunkLength: 10,
		stringArray: true,
		stringArrayCallsTransform: true,
		stringArrayEncoding: ['base64'],
		stringArrayIndexShift: true,
		stringArrayRotate: true,
		stringArrayShuffle: true,
		stringArrayWrappersCount: 2,
		stringArrayWrappersChainedCalls: true,
		stringArrayWrappersParametersMaxCount: 4,
		stringArrayWrappersType: 'variable',
		stringArrayThreshold: 0.75,
		transformObjectKeys: true,
		unicodeEscapeSequence: false,
		target: 'browser',
		sourceMap: false
	});

	return obfuscationResult.getObfuscatedCode();
}

/**
 * Minify user's HTML
 *
 * Uses standard html-minifier-terser library to:
 * - Minify inline JavaScript (single line, preserve variable names)
 * - Minify CSS
 * - Remove whitespace and comments
 */
function minifyUserHtml(html) {
	const { minify } = require('html-minifier-terser');

	return minify(html, {
		collapseWhitespace: true,
		removeComments: true,
		minifyJS: true,  // Minify inline <script> tags
		minifyCSS: true, // Minify inline <style> tags
		removeAttributeQuotes: false,
		removeEmptyAttributes: false,
		removeRedundantAttributes: true,
		useShortDoctype: true,
		keepClosingSlash: true,
		conservativeCollapse: false
	});
}

// Export the obfuscated version wrapped in script tags
// This is called once when the plugin is loaded
const ROOPIK_INJECT_SCRIPT = `
<script type="text/javascript">
${obfuscateScript(ROOPIK_INJECT_SCRIPT_SOURCE)}
</script>
`;

// Toggle user HTML minification (set to false to disable)
const MINIFY_USER_HTML = true;

function createRoopikInjectPlugin() {
	return {
		name: 'roopik-inject',
		async transformIndexHtml(html) {
			// Minify user's HTML if enabled (handles inline scripts, CSS, whitespace)
			if (MINIFY_USER_HTML) {
				try {
					html = await minifyUserHtml(html);
				} catch (error) {
					// If minification fails, continue with original HTML
					console.warn('[Roopik] Failed to minify HTML:', error.message);
				}
			}

			// Inject Roopik script before closing body tag
			return html.replace('</body>', ROOPIK_INJECT_SCRIPT + '</body>');
		}
	};
}

module.exports = { createRoopikInjectPlugin };
