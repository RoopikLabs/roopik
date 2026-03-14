/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// Preload script for Roopik embedded browser (WebContentsView).
// Runs in the renderer's isolated preload context (contextIsolation: true).
// Uses contextBridge to safely expose a minimal IPC bridge to the page.

(function () {
	'use strict';

	const { ipcRenderer, contextBridge, webFrame } = require('electron');

	// =========================================================================
	// SSO/Auth Domain Allowlist
	// These domains need local-network-access permissions for SSO flows
	// =========================================================================
	const SSO_DOMAINS = [
		'.okta.com',
		'.okta-emea.com',
		'.oktapreview.com',
		'.duosecurity.com',
		'.duo.com',
		'.login.microsoftonline.com',
		'.onelogin.com',
		'.auth0.com',
		'.pingidentity.com',
		'.pingone.com',
		'.rippling.com'
	];

	// =========================================================================
	// 1. Local Network Access Polyfill
	// SSO providers (Okta, Duo, etc.) request 'local-network-access' permission
	// which Electron doesn't support. This polyfill auto-grants it so SSO
	// login flows don't break.
	// =========================================================================
	function applyLocalNetworkAccessPolyfill() {
		const currentUrl = window.location.href.toLowerCase();
		const isSSO = SSO_DOMAINS.some(domain => currentUrl.includes(domain));
		if (!isSSO) { return; }

		webFrame.executeJavaScript(`
			(function() {
				if (window.__localNetworkPolyfillApplied) return;
				window.__localNetworkPolyfillApplied = true;

				if (navigator.permissions && navigator.permissions.query) {
					const originalQuery = navigator.permissions.query.bind(navigator.permissions);
					navigator.permissions.query = function(descriptor) {
						if (descriptor && (descriptor.name === 'local-network-access' || descriptor.name === 'local-network')) {
							return Promise.resolve({ state: 'granted', onchange: null });
						}
						return originalQuery(descriptor);
					};
				}
			})();
		`).catch(() => {});
	}

	// =========================================================================
	// 2. WebAuthn / Passkey Polyfill
	// Gracefully rejects WebAuthn requests with proper DOMException instead of
	// crashing or hanging. Prevents sites from detecting passkey absence as
	// a bot signal. Also reports back via IPC so the app can show a notification.
	// =========================================================================
	function applyWebAuthnPolyfill() {
		webFrame.executeJavaScript(`
			(function() {
				if (window.__webAuthnPolyfillApplied) return;
				window.__webAuthnPolyfillApplied = true;

				// Throttle passkey-not-supported messages (once per 10 seconds)
				let lastPasskeyMsg = 0;
				function notifyPasskeyNotSupported() {
					const now = Date.now();
					if (now - lastPasskeyMsg < 10000) return;
					lastPasskeyMsg = now;
					try {
						if (window.roopikBrowser && window.roopikBrowser.send) {
							window.roopikBrowser.send('passkey-not-supported');
						}
					} catch(e) {}
				}

				if (typeof navigator.credentials !== 'undefined') {
					// Patch credentials.create — reject passkey creation
					const originalCreate = navigator.credentials.create?.bind(navigator.credentials);
					if (originalCreate) {
						navigator.credentials.create = function(options) {
							if (options && options.publicKey) {
								notifyPasskeyNotSupported();
								return Promise.reject(new DOMException(
									'The operation either timed out or was not allowed.',
									'NotAllowedError'
								));
							}
							return originalCreate(options);
						};
					}

					// Patch credentials.get — reject passkey authentication
					const originalGet = navigator.credentials.get?.bind(navigator.credentials);
					if (originalGet) {
						navigator.credentials.get = function(options) {
							if (options && options.publicKey) {
								notifyPasskeyNotSupported();
								return Promise.reject(new DOMException(
									'The operation either timed out or was not allowed.',
									'NotAllowedError'
								));
							}
							return originalGet(options);
						};
					}
				}

				// Report that platform authenticator is not available
				if (typeof PublicKeyCredential !== 'undefined') {
					PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = function() {
						return Promise.resolve(false);
					};
					if (PublicKeyCredential.isConditionalMediationAvailable) {
						PublicKeyCredential.isConditionalMediationAvailable = function() {
							return Promise.resolve(false);
						};
					}
				}
			})();
		`).catch(() => {});
	}

	// =========================================================================
	// Apply polyfills
	// =========================================================================
	applyLocalNetworkAccessPolyfill();
	applyWebAuthnPolyfill();

	// =========================================================================
	// 3. IPC Bridge — expose roopikBrowser to page context
	// Whitelist-based: only specific message types are forwarded to main process.
	// This is the secure way to communicate from page -> main in Electron.
	// =========================================================================
	const ALLOWED_MESSAGES = [
		'focus-url-bar',
		'element-selected',
		'element-updated',
		'keyboard-shortcut',
		'area-screenshot-selected',
		'style-changes-confirmed',
		'css-inspector-style-change',
		'passkey-not-supported'
	];

	const roopikBridge = {
		send: (channel, ...args) => {
			if (ALLOWED_MESSAGES.includes(channel)) {
				ipcRenderer.send('roopik:browser-view-message', channel, ...args);
			}
		}
	};

	contextBridge.exposeInMainWorld('roopikBrowser', roopikBridge);
})();
