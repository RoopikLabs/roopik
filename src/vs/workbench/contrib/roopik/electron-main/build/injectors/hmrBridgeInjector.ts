/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * HMR Bridge Injector
 *
 * Adds hot module replacement support for live updates.
 * Listens for update messages from parent and reloads component.
 */

import { BaseInjector } from './types.js';
import type { InjectorContext } from './types.js';

export class HmrBridgeInjector extends BaseInjector {
	override readonly name = 'hmr-bridge';
	override readonly priority = 90; // Run late, after other injectors

	override inject(code: string, context: InjectorContext): string {
		const hmrScript = `
// ===== Roopik HMR Bridge =====
(function() {
	const componentId = ${JSON.stringify(context.componentId)};

	// Listen for HMR updates from parent
	window.addEventListener('message', function(event) {
		if (event.data?.type === 'roopik-hmr-update') {
			if (event.data.componentId === componentId) {
				// Reload the iframe to apply new code
				window.location.reload();
			}
		}
	});

	// Notify parent that component is ready
	window.parent.postMessage({
		type: 'roopik-component-ready',
		componentId: componentId,
		timestamp: Date.now()
	}, '*');
})();
// ===== End HMR Bridge =====

`;
		return code + hmrScript;
	}
}
