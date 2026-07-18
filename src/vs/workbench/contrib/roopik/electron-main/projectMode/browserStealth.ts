/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Browser Stealth (Anti-Fingerprint)
 *
 * Makes the embedded browser indistinguishable from real Chrome.
 * Patches run via CDP Page.addScriptToEvaluateOnNewDocument
 * which executes in the PAGE's isolated V8 context BEFORE
 * any site JavaScript — safe, won't affect VSCode internals.
 *
 * Session-level patches (UA cleanup, headers) remain in browserViewService.ts
 * since they're tied to the session lifecycle. This file handles only the
 * CDP-injected page-context stealth script.
 */

import type { WebContentsView } from 'electron';

/**
 * The stealth script injected into every page via CDP.
 * Runs before ANY page JavaScript in the page's isolated V8 context.
 */
const STEALTH_SCRIPT = `
	// =====================================================
	// ROOPIK BROWSER STEALTH PATCHES
	// Runs before ANY page JavaScript in isolated page context
	// =====================================================

	// 1. Remove Electron/Node.js globals that leak into page context
	//    contextIsolation:true + sandbox:true should prevent this, but defense-in-depth.
	//    Use Object.defineProperty with undefined value because delete may
	//    silently fail on non-configurable properties (e.g. global).
	const nodeGlobals = ['global', 'process', 'require', 'Buffer', 'module', 'exports', '__dirname', '__filename'];
	for (const prop of nodeGlobals) {
		try {
			if (prop in window) {
				Object.defineProperty(window, prop, {
					value: undefined,
					writable: true,
					configurable: true,
					enumerable: false
				});
			}
		} catch(e) {
			// Fallback: try delete
			try { delete window[prop]; } catch(e2) {}
		}
	}

	// 2. Patch window.chrome to match real Chrome 145
	//    Real Chrome has: loadTimes, csi, app (NO runtime in normal pages)
	Object.defineProperty(window, 'chrome', {
		value: {
			// chrome.loadTimes() - returns page load timing info
			loadTimes: function() {
				const perf = performance.timing || {};
				const navStart = perf.navigationStart || Date.now();
				return {
					requestTime: navStart / 1000,
					startLoadTime: navStart / 1000,
					commitLoadTime: (perf.responseStart || navStart) / 1000,
					finishDocumentLoadTime: (perf.domContentLoadedEventEnd || navStart) / 1000,
					finishLoadTime: (perf.loadEventEnd || navStart) / 1000,
					firstPaintTime: 0,
					firstPaintAfterLoadTime: 0,
					navigationType: 'Other',
					wasFetchedViaSpdy: false,
					wasNpnNegotiated: true,
					npnNegotiatedProtocol: 'h2',
					wasAlternateProtocolAvailable: false,
					connectionInfo: 'h2'
				};
			},

			// chrome.csi() - returns Client Side Instrumentation data
			csi: function() {
				const navStart = (performance.timing || {}).navigationStart || Date.now();
				return {
					startE: navStart,
					onloadT: navStart,
					pageT: performance.now(),
					tran: 16
				};
			},

			// chrome.app - app installation info
			app: {
				isInstalled: false,
				getDetails: function() { return null; },
				getIsInstalled: function() { return false; },
				installState: function() { return 'disabled'; },
				runningState: function() { return 'cannot_run'; },
				InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
				RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
			}
		},
		writable: false,
		configurable: false,
		enumerable: true
	});

	// 3. Ensure navigator.webdriver is false (Electron sometimes sets it)
	Object.defineProperty(navigator, 'webdriver', {
		get: () => false,
		configurable: true
	});

	// 4. Override navigator.languages to match real Chrome
	Object.defineProperty(navigator, 'languages', {
		get: () => Object.freeze(['en-IN', 'en-GB', 'en-US', 'en']),
		configurable: true
	});

	// 5. Override navigator.plugins to match real Chrome (5 PDF plugins)
	//    Cloudflare checks plugin count and names
	Object.defineProperty(navigator, 'plugins', {
		get: () => {
			const pluginData = [
				{ name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
				{ name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
				{ name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
				{ name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
				{ name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }
			];
			const plugins = Object.create(PluginArray.prototype);
			pluginData.forEach((p, i) => {
				const plugin = Object.create(Plugin.prototype);
				Object.defineProperties(plugin, {
					name: { value: p.name, enumerable: true },
					filename: { value: p.filename, enumerable: true },
					description: { value: p.description, enumerable: true },
					length: { value: 1, enumerable: true },
					0: { value: { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: plugin } }
				});
				Object.defineProperty(plugins, i, { value: plugin, enumerable: true });
			});
			Object.defineProperty(plugins, 'length', { value: 5, enumerable: true });
			plugins.item = function(i) { return this[i] || null; };
			plugins.namedItem = function(name) { for (let i = 0; i < this.length; i++) { if (this[i].name === name) return this[i]; } return null; };
			plugins.refresh = function() {};
			return plugins;
		},
		configurable: true
	});

	// 6. Ensure navigator.pdfViewerEnabled is true (Chrome always has this)
	Object.defineProperty(navigator, 'pdfViewerEnabled', {
		get: () => true,
		configurable: true
	});

	// 7. Override navigator.appVersion to match clean UA
	Object.defineProperty(navigator, 'appVersion', {
		get: () => navigator.userAgent.substring(navigator.userAgent.indexOf('/') + 1),
		configurable: true
	});

	// 8. Patch navigator.userAgentData to include "Google Chrome" brand
	//    Electron only has "Chromium" — real Chrome has both "Chromium" AND "Google Chrome"
	//    Cloudflare checks this API (it's the modern replacement for UA string)
	if (navigator.userAgentData) {
		const chromeVersion = (navigator.userAgent.match(/Chrome\\/(\\d+)/) || [])[1] || '142';
		const patchedBrands = [
			{ brand: 'Not:A-Brand', version: '99' },
			{ brand: 'Google Chrome', version: chromeVersion },
			{ brand: 'Chromium', version: chromeVersion }
		];
		const originalUAData = navigator.userAgentData;
		const patchedUAData = {
			brands: patchedBrands,
			mobile: false,
			platform: 'Windows',
			getHighEntropyValues: originalUAData.getHighEntropyValues
				? originalUAData.getHighEntropyValues.bind(originalUAData)
				: function(hints) {
					return Promise.resolve({
						brands: patchedBrands,
						mobile: false,
						platform: 'Windows',
						platformVersion: '15.0.0',
						architecture: 'x86',
						bitness: '64',
						model: '',
						uaFullVersion: chromeVersion + '.0.0.0',
						fullVersionList: patchedBrands.map(b => ({ brand: b.brand, version: b.version + '.0.0.0' }))
					});
				},
			toJSON: function() {
				return { brands: patchedBrands, mobile: false, platform: 'Windows' };
			}
		};
		Object.defineProperty(navigator, 'userAgentData', {
			get: () => patchedUAData,
			configurable: true
		});
	}

	// 9. Patch Notification.permission to return 'granted' (match Cursor)
	if (typeof Notification !== 'undefined') {
		const origNotification = Notification;
		Object.defineProperty(origNotification, 'permission', {
			get: () => 'granted',
			configurable: true
		});
	}

	// 10. Patch permissions API to not leak automation signals
	if (navigator.permissions) {
		const originalQuery = navigator.permissions.query.bind(navigator.permissions);
		navigator.permissions.query = function(parameters) {
			// For 'notifications' permission, return 'granted' (match Cursor)
			if (parameters.name === 'notifications') {
				return Promise.resolve({ state: 'granted', onchange: null });
			}
			return originalQuery(parameters);
		};
	}

	// 11. Hide automation-related properties from window/navigator
	//     Puppeteer, Playwright, Selenium all leave traces
	const automationProps = [
		'__nightmare', '__selenium_unwrapped', '__webdriver_evaluate',
		'__webdriver_script_function', '__webdriver_script_func',
		'__webdriver_script_fn', '__fxdriver_evaluate', '__driver_evaluate',
		'__webdriver_unwrapped', '__driver_unwrapped', '_Selenium_IDE_Recorder',
		'_selenium', 'calledSelenium', '_WEBDRIVER_ELEM_CACHE',
		'ChromeDriverw', 'driver-hierarchical', 'driver-evaluate',
		'webdriver', 'domAutomation', 'domAutomationController',
		'_phantom', '__phantomas', 'callPhantom',
		'_cdp_runtime', '__puppeteer_evaluation_script__'
	];
	for (const prop of automationProps) {
		try { delete window[prop]; } catch(e) {}
		try { delete document[prop]; } catch(e) {}
	}

	// 12. Patch iframe contentWindow to inherit stealth patches
	//     Cloudflare Turnstile runs inside an iframe and checks from there
	const originalCreateElement = document.createElement.bind(document);
	document.createElement = function(tagName, options) {
		const element = originalCreateElement(tagName, options);
		if (tagName.toLowerCase() === 'iframe') {
			// When iframe loads, patch its contentWindow too
			const originalSetter = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src')?.set;
			if (originalSetter) {
				let patched = false;
				element.addEventListener('load', function() {
					if (patched) return;
					patched = true;
					try {
						const iframeWin = element.contentWindow;
						if (iframeWin) {
							// Ensure webdriver is false in iframe context
							Object.defineProperty(iframeWin.navigator, 'webdriver', {
								get: () => false, configurable: true
							});
						}
					} catch(e) {} // Cross-origin iframes will throw — that's fine
				});
			}
		}
		return element;
	};

	// 13. Canvas fingerprint consistency
	//     Don't BLOCK canvas (that's suspicious) — just ensure it works normally
	//     Real Chrome allows canvas. Headless Chrome sometimes has rendering differences.
	//     We just make sure toDataURL and getImageData aren't overridden (they shouldn't be)

	// 14. WebGL renderer info — ensure it's not "SwiftShader" (headless signal)
	//     Our browser uses real GPU so this should be fine, but defense-in-depth
	const getParamOriginal = WebGLRenderingContext.prototype.getParameter;
	WebGLRenderingContext.prototype.getParameter = function(param) {
		// UNMASKED_RENDERER_WEBGL = 0x9246, UNMASKED_VENDOR_WEBGL = 0x9245
		const result = getParamOriginal.call(this, param);
		// If SwiftShader is returned (headless), mask it
		if (param === 0x9246 && typeof result === 'string' && result.includes('SwiftShader')) {
			return 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)';
		}
		return result;
	};

	// 15. Patch window.outerWidth/outerHeight
	//     In headless browsers these are 0. Ours should be fine since we use
	//     a real WebContentsView, but ensure they're never 0
	if (window.outerWidth === 0) {
		Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth, configurable: true });
	}
	if (window.outerHeight === 0) {
		Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight + 85, configurable: true });
	}

	// 16. Ensure correct toString() for patched functions
	//     Bot detectors call .toString() on native functions to check if they're overridden
	//     Native functions return "function functionName() { [native code] }"
	const nativeToString = Function.prototype.toString;
	const patchedFunctions = new Map();
	const originalToString = Function.prototype.toString;
	Function.prototype.toString = function() {
		if (patchedFunctions.has(this)) {
			return patchedFunctions.get(this);
		}
		return originalToString.call(this);
	};
	// Mark our patched functions as "native"
	patchedFunctions.set(Function.prototype.toString, 'function toString() { [native code] }');
	if (navigator.permissions) {
		patchedFunctions.set(navigator.permissions.query, 'function query() { [native code] }');
	}
	patchedFunctions.set(document.createElement, 'function createElement() { [native code] }');
	patchedFunctions.set(WebGLRenderingContext.prototype.getParameter, 'function getParameter() { [native code] }');
`;

/**
 * Inject browser stealth patches into a WebContentsView via CDP.
 *
 * Two-phase approach:
 * 1. Immediately registers a dom-ready handler to inject stealth script on the
 *    FIRST page load via executeJavaScript (since CDP may not be ready yet).
 * 2. Kicks off CDP setup in the background — once ready, registers the stealth
 *    script via Page.addScriptToEvaluateOnNewDocument for ALL subsequent navigations.
 *
 * This avoids blocking browser view creation while ensuring stealth patches apply.
 *
 * @param browserView The WebContentsView to patch
 * @param debuggerAttached Map tracking debugger attachment state (updated in-place)
 */
export function injectStealthPatches(
	browserView: WebContentsView,
	debuggerAttached: Map<number, boolean>
): void {
	const wc = browserView.webContents;

	// Phase 1: Inject stealth script on the FIRST page load via executeJavaScript.
	// This runs synchronously in the page context after DOM is ready.
	// Handles the race condition where CDP isn't ready before first navigation.
	let firstLoadPatched = false;
	wc.on('dom-ready', () => {
		if (firstLoadPatched) { return; }
		firstLoadPatched = true;
		wc.executeJavaScript(STEALTH_SCRIPT).catch(() => {
			// Non-fatal: page may have navigated away
		});
	});

	// Phase 2: Setup CDP in background for all subsequent navigations.
	// This registers the script via addScriptToEvaluateOnNewDocument which
	// runs BEFORE any page JS on every future navigation.
	setupCDPStealth(wc, debuggerAttached).catch(() => {
		// Non-fatal: CDP stealth is best-effort, Phase 1 covers first load
	});
}

/**
 * Background CDP setup — attaches debugger, overrides UA, registers stealth script.
 */
async function setupCDPStealth(
	wc: Electron.WebContents,
	debuggerAttached: Map<number, boolean>
): Promise<void> {
	// Attach debugger for CDP access
	if (!wc.debugger.isAttached()) {
		wc.debugger.attach('1.3');
		debuggerAttached.set(wc.id, true);
	}

	// Enable Page domain (required for addScriptToEvaluateOnNewDocument)
	await wc.debugger.sendCommand('Page.enable');

	// Build clean User-Agent (strip Electron/Roopik from navigator properties)
	const defaultUA = wc.session.getUserAgent();
	const cleanUA = defaultUA
		.replace(/\s*roopik[-\w]*\/[\d.]+/gi, '')
		.replace(/\s*Electron\/[\d.]+/gi, '');

	// Override navigator properties via CDP (covers navigator.userAgent, languages, platform etc.)
	await wc.debugger.sendCommand('Network.enable');
	await wc.debugger.sendCommand('Network.setUserAgentOverride', {
		userAgent: cleanUA,
		acceptLanguage: 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
		platform: 'Win32'
	});

	// Register stealth script for ALL future navigations
	await wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
		source: STEALTH_SCRIPT
	});
}
