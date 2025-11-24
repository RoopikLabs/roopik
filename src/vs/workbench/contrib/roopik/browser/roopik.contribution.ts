/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik Labs. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';

/**
 * Roopik Design IDE - Main Contribution
 *
 * Registers commands that are programmatically callable by:
 * - UI (command palette, keybindings)
 * - AI agents (tool calling)
 * - API (external integrations)
 */

// Test command to verify core integration
class RoopikTestCommand extends Action2 {
	constructor() {
		super({
			id: 'roopik.test',
			title: {
				value: 'Roopik: Test Command',
				original: 'Roopik: Test Command'
			},
			category: Categories.Developer,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		console.log('[Roopik] Core integration working! 🎨');
		return Promise.resolve();
	}
}

registerAction2(RoopikTestCommand);

console.log('[Roopik] Contribution loaded ✓');
