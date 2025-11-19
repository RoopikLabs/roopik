/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Webview-Only Access Control Middleware
 * Blocks external browsers by detecting VSCode's Electron user-agent
 */

function createAuthMiddleware() {
	return (req, res, next) => {
		// Allow OPTIONS requests (CORS preflight)
		if (req.method === 'OPTIONS') {
			return next();
		}

		const userAgent = req.headers['user-agent'] || '';
		const origin = req.headers['origin'] || req.headers['referer'] || '';

		// Log all headers for debugging
		console.log('[Roopik Auth] User-Agent:', userAgent);
		console.log('[Roopik Auth] Origin:', origin);

		// VSCode webview runs in Electron, so User-Agent contains "Electron"
		// External browsers (Chrome, Firefox, Edge) do NOT contain "Electron"
		if (userAgent.includes('Electron') || userAgent.includes('VSCode')) {
			console.log('[Roopik Auth] ✓ Allowed VSCode webview (Electron detected)');
			return next();
		}

		// Block all other origins (external browsers, curl, etc.)
		console.log('[Roopik Auth] ✗ Blocked external request');
		res.statusCode = 403;
		res.setHeader('Content-Type', 'text/html');
		res.end(`
<!DOCTYPE html>
<html>
<head>
	<title>Access Denied - Roopik</title>
	<style>
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			display: flex;
			align-items: center;
			justify-content: center;
			height: 100vh;
			margin: 0;
			background: #1e1e1e;
			color: #fff;
		}
		.container {
			text-align: center;
			max-width: 500px;
			padding: 40px;
		}
		h1 {
			color: #f48771;
			margin: 0 0 20px 0;
		}
		p {
			color: #ccc;
			line-height: 1.6;
		}
	</style>
</head>
<body>
	<div class="container">
		<h1>🔒 Access Denied</h1>
		<p>This Roopik development server requires authentication.</p>
		<p>Please open this preview from within the Roopik IDE.</p>
	</div>
</body>
</html>
		`);
	};
}

module.exports = { createAuthMiddleware };
