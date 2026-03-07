/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Error Boundary Injector
 *
 * Wraps component code with error handling for graceful error display in sandbox.
 * Shows user-friendly error messages instead of white screens.
 */

import { BaseInjector } from './types.js';
import type { InjectorContext } from './types.js';

export class ErrorBoundaryInjector extends BaseInjector {
	override readonly name = 'error-boundary';
	override readonly priority = 10; // Run early to wrap everything

	override inject(code: string, context: InjectorContext): string {
		const errorScript = `
// ===== Roopik Error Boundary =====
(function() {
	const componentId = ${JSON.stringify(context.componentId)};

	// Global error handler
	window.onerror = function(message, source, lineno, colno, error) {
		showError({
			type: 'runtime',
			message: message,
			source: source,
			line: lineno,
			column: colno,
			stack: error?.stack
		});
		return true; // Prevent default error handling
	};

	// Unhandled promise rejection handler
	window.onunhandledrejection = function(event) {
		showError({
			type: 'promise',
			message: event.reason?.message || String(event.reason),
			stack: event.reason?.stack
		});
		return true;
	};

	function showError(error) {
		const root = document.getElementById('root');
		if (!root) return;

		root.innerHTML = \`
			<div style="
				font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
				padding: 20px;
				background: #fef2f2;
				border: 1px solid #fecaca;
				border-radius: 8px;
				margin: 16px;
				color: #991b1b;
			">
				<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
					<span style="font-size: 20px;">⚠️</span>
					<strong style="font-size: 16px;">Component Error</strong>
				</div>
				<div style="
					background: #fff;
					padding: 12px;
					border-radius: 4px;
					font-size: 14px;
					overflow-x: auto;
				">
					<div style="color: #dc2626; margin-bottom: 8px;">
						\${escapeHtml(error.message)}
					</div>
					\${error.stack ? \`
						<pre style="
							margin: 0;
							padding: 8px;
							background: #f3f4f6;
							border-radius: 4px;
							font-size: 12px;
							overflow-x: auto;
							white-space: pre-wrap;
							word-break: break-word;
							color: #4b5563;
						">\${escapeHtml(error.stack)}</pre>
					\` : ''}
				</div>
				<div style="margin-top: 12px; font-size: 12px; color: #6b7280;">
					Component: \${componentId}
				</div>
			</div>
		\`;

		// Notify parent (for logging/analytics)
		try {
			window.parent.postMessage({
				type: 'roopik-component-error',
				componentId: componentId,
				error: error
			}, '*');
		} catch (e) {
			// Ignore postMessage errors
		}
	}

	function escapeHtml(str) {
		if (!str) return '';
		return String(str)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}
})();
// ===== End Error Boundary =====

`;
		return errorScript + code;
	}
}
