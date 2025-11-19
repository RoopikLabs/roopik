/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Authentication Middleware
 * Protects dev server from external access
 */

function createAuthMiddleware(authToken) {
	return (req, res, next) => {
		// Allow OPTIONS requests (CORS preflight)
		if (req.method === 'OPTIONS') {
			return next();
		}

		// Skip auth for HMR WebSocket connections
		if (req.url?.startsWith('/@vite/client') || req.url?.startsWith('/@fs/')) {
			// Check if cookie is present
			const cookies = parseCookies(req.headers.cookie);
			if (cookies.roopik_auth === authToken) {
				return next();
			}
		}

		// Check token in query param or header
		const url = new URL(req.url || '/', `http://${req.headers.host}`);
		const queryToken = url.searchParams.get('token');
		const headerToken = req.headers['x-roopik-token'];

		if (queryToken === authToken || headerToken === authToken) {
			// Valid token, set cookie for future requests
			res.setHeader('Set-Cookie', `roopik_auth=${authToken}; HttpOnly; SameSite=Strict; Path=/`);

			// Remove token from URL (redirect)
			if (queryToken) {
				url.searchParams.delete('token');
				const newUrl = url.pathname + (url.search || '');

				// For non-root paths, just continue (cookie is set)
				if (url.pathname !== '/') {
					return next();
				}

				// For root, redirect to remove token from URL
				res.statusCode = 302;
				res.setHeader('Location', newUrl);
				res.end();
				return;
			}

			return next();
		}

		// Check cookie
		const cookies = parseCookies(req.headers.cookie);
		if (cookies.roopik_auth === authToken) {
			return next();
		}

		// Unauthorized
		res.statusCode = 403;
		res.setHeader('Content-Type', 'text/plain');
		res.end('Forbidden: Invalid or missing authentication token');
	};
}

function parseCookies(cookieHeader) {
	const cookies = {};
	if (!cookieHeader) return cookies;

	cookieHeader.split(';').forEach(cookie => {
		const [key, value] = cookie.trim().split('=');
		if (key && value) {
			cookies[key] = value;
		}
	});

	return cookies;
}

module.exports = { createAuthMiddleware };
