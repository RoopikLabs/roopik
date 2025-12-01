/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Sandbox Renderer Utility
 *
 * Helper functions for creating and managing sandboxes with the new pipeline.
 */

import { ISandboxPipelineService } from '../../common/sandboxPipeline/sandboxPipelineService.js';
import { ComponentInput } from '../../common/sandboxPipeline/types.js';

/**
 * Get the sandbox template HTML
 */
export function getSandboxTemplate(): string {
	// In production, this would load from the actual HTML file
	// For now, we inline it to avoid file loading issues
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Roopik Sandbox</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; overflow: hidden; }
    #root { width: 100%; height: 100vh; overflow: auto; }
    .sandbox-error { padding: 20px; background: #fee; border-left: 4px solid #c33; color: #c33; font-family: monospace; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module">
    let sandboxId = null;
    window.addEventListener('message', async (event) => {
      const { type, data } = event.data;
      if (type === 'execute') {
        sandboxId = data.sandboxId;
        try {
          eval(data.code);
          window.parent.postMessage({ type: 'rendered', sandboxId }, '*');
        } catch (error) {
          const errorDiv = document.createElement('div');
          errorDiv.className = 'sandbox-error';
          errorDiv.textContent = \`Error: \${error.message}\\n\\nStack:\\n\${error.stack}\`;
          document.getElementById('root').appendChild(errorDiv);
          window.parent.postMessage({ type: 'error', sandboxId, error: { message: error.message, stack: error.stack } }, '*');
        }
      }
      if (type === 'cleanup') {
        document.getElementById('root').innerHTML = '';
      }
    });
    window.parent.postMessage({ type: 'ready' }, '*');
    window.addEventListener('error', (event) => {
      window.parent.postMessage({ type: 'error', sandboxId, error: { message: event.message } }, '*');
    });
  </script>
</body>
</html>`;
}

/**
 * Create a sandbox iframe with the new template
 */
export function createSandboxIframe(containerId: string): HTMLIFrameElement {
	const iframe = document.createElement('iframe');
	iframe.id = containerId;
	iframe.sandbox.add('allow-scripts');
	iframe.style.width = '100%';
	iframe.style.height = '100%';
	iframe.style.border = 'none';

	// Set sandbox content
	iframe.srcdoc = getSandboxTemplate();

	return iframe;
}

/**
 * Execute code in sandbox using the pipeline
 */
export async function executeSandboxCode(
	pipelineService: ISandboxPipelineService,
	iframe: HTMLIFrameElement,
	input: ComponentInput
): Promise<void> {
	// 1. Transform code via pipeline
	const jobId = await pipelineService.processComponent(input);

	// 2. Wait for transformation
	const result = await pipelineService.waitForCompletion(jobId);

	// 3. Send to iframe
	iframe.contentWindow?.postMessage({
		type: 'execute',
		data: {
			sandboxId: input.id,
			code: result.bundledCode
		}
	}, '*');
}

/**
 * Extract dependencies from code (optional helper)
 */
export function extractDependenciesFromCode(code: string): Record<string, string> | undefined {
	// Simple heuristic: look for common imports
	const deps: Record<string, string> = {};

	if (code.includes('from "react"') || code.includes("from 'react'")) {
		deps['react'] = '18';
		deps['react-dom'] = '18';
	}

	if (code.includes('from "vue"') || code.includes("from 'vue'")) {
		deps['vue'] = '3';
	}

	if (code.includes('from "solid-js"') || code.includes("from 'solid-js'")) {
		deps['solid-js'] = '1';
	}

	return Object.keys(deps).length > 0 ? deps : undefined;
}
