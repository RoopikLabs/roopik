/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Roopik HTML Injection Plugin
 * Injects click-to-source script into HTML
 */

const ROOPIK_INJECT_SCRIPT = `
<script type="text/javascript">
// Roopik Click-to-Source Integration (In-Memory - Trade Secret Protected)
(function() {
	if (window.parent === window) return;

	console.log('[Roopik] Click-to-source enabled');

	let debugMode = false;

	// Listen for debug mode toggle
	window.addEventListener('message', (event) => {
		const message = event.data;
		if (message.type === 'roopik-toggle-debug') {
			debugMode = message.enabled;
			console.log('[Roopik] Debug mode:', debugMode ? 'ON' : 'OFF');
		} else if (message.type === 'roopik-back') {
			window.history.back();
		} else if (message.type === 'roopik-forward') {
			window.history.forward();
		}
	});

	// Track URL changes
	let lastUrl = location.href;
	function notifyUrlChange() {
		if (location.href !== lastUrl) {
			lastUrl = location.href;
			window.parent.postMessage({ type: 'roopik-navigate', url: location.href }, '*');
		}
	}
	setInterval(notifyUrlChange, 500);
	window.addEventListener('popstate', notifyUrlChange);

	// Click-to-source listener
	document.addEventListener('click', (event) => {
		if (!debugMode || !(event.metaKey || event.ctrlKey)) return;

		event.preventDefault();
		event.stopPropagation();

		const source = findSourceInfo(event.target);
		if (source) {
			console.log('[Roopik] Found source:', source);
			window.parent.postMessage({
				type: 'roopik-click-to-source',
				file: source.fileName,
				line: source.lineNumber,
				column: source.columnNumber,
				componentName: source.componentName
			}, '*');
		}
	}, true);

	// Find source info from element
	function findSourceInfo(element) {
		try {
			// Check data-roopik-source attribute first
			if (element.hasAttribute && element.hasAttribute('data-roopik-source')) {
				const sourceData = element.getAttribute('data-roopik-source');
				console.log('[Roopik] Found data-roopik-source:', sourceData);

				const parts = sourceData.split(':');
				if (parts.length >= 2) {
					const fileName = parts.slice(0, -2).join(':');
					const lineNumber = parseInt(parts[parts.length - 2], 10);
					const columnNumber = parseInt(parts[parts.length - 1], 10);
					return { fileName, lineNumber, columnNumber, componentName: element.tagName || 'Unknown' };
				}
			}

			// Fallback: React Fiber
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
			console.error('[Roopik] Error finding source:', error);
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

	// Initial URL notification
	window.parent.postMessage({ type: 'roopik-navigate', url: location.href }, '*');
})();
</script>
`;

function createRoopikInjectPlugin() {
	return {
		name: 'roopik-inject',
		transformIndexHtml(html) {
			// Inject script before closing body tag
			return html.replace('</body>', ROOPIK_INJECT_SCRIPT + '</body>');
		}
	};
}

module.exports = { createRoopikInjectPlugin };
