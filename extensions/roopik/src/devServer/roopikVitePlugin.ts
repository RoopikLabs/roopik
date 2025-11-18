/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Vite plugin that injects Roopik click-to-source script
 *
 * This plugin will be auto-injected when Roopik starts the dev server.
 * It adds the roopik-inject.js script to every HTML page.
 */

export const ROOPIK_INJECT_SCRIPT = `
<script>
// Roopik Click-to-Source Integration (Auto-injected)
(function() {
  if (window.parent === window) return;

  console.log('[Roopik] Click-to-source enabled');

  let debugMode = false;

  // Listen for debug mode toggle from Roopik
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

  // Find React Fiber source
  function findSourceInfo(element) {
    try {
      const fiberKey = Object.keys(element).find(key =>
        key.startsWith('__reactFiber') || key.startsWith('_reactFiber') || key === '_reactInternalFiber'
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

      // Try Vue
      const vueKey = Object.keys(element).find(key => key.startsWith('__vue') || key.startsWith('__vnode'));
      if (vueKey) {
        const vnode = element[vueKey];
        if (vnode && vnode.type && vnode.type.__file) {
          return {
            fileName: vnode.type.__file,
            lineNumber: 1,
            columnNumber: 0,
            componentName: vnode.type.name || 'VueComponent'
          };
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

/**
 * Create Vite plugin configuration
 */
export function createRoopikVitePlugin() {
	return `
export default {
  name: 'roopik-inject',
  transformIndexHtml(html) {
    // Inject Roopik script before closing body tag
    return html.replace(
      '</body>',
      \`${ROOPIK_INJECT_SCRIPT.replace(/`/g, '\\`').replace(/\$/g, '\\$')}
</body>\`
    );
  }
};
`;
}
