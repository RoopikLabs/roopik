/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * GitHub Import Adapter (STUB)
 *
 * =============================================================================
 * WHY THIS IS A STUB
 * =============================================================================
 *
 * GitHub imports are complex because:
 * 1. Users rarely import a single component file
 * 2. Usually it's an entire repo or project with multiple components
 * 3. Nested structures, dependencies, configs need handling
 *
 * RECOMMENDED FLOW (Future Implementation):
 * 1. User provides GitHub URL
 * 2. We clone/download to workspace root (like normal git clone)
 * 3. User then uses LocalFileAdapter to import specific components
 * 4. Or drag-and-drop specific files to canvas
 *
 * This keeps GitHub import simple (just fetch files) and reuses
 * LocalFileAdapter for the actual component extraction.
 *
 * =============================================================================
 * POSSIBLE IMPLEMENTATION APPROACHES
 * =============================================================================
 *
 * Approach 1: Clone to Workspace
 * - Clone entire repo to workspace/.imports/{repo-name}/
 * - User browses and selects components via LocalFileAdapter
 * - Pros: Full project context, respects .gitignore, etc.
 * - Cons: Requires git, downloads everything
 *
 * Approach 2: GitHub API Tree Traversal
 * - Use GitHub API to list files in a directory
 * - Let user select specific files/folders
 * - Download only selected files
 * - Pros: Selective, no git required
 * - Cons: API rate limits, complex tree navigation UI
 *
 * Approach 3: Raw File Fetch (Current Stub)
 * - User provides exact file path in repo
 * - Fetch single file via raw.githubusercontent.com
 * - Pros: Simple, fast
 * - Cons: Only single files, user needs to know exact path
 *
 * =============================================================================
 * CURRENT STATUS: NOT PRIORITY
 * =============================================================================
 *
 * Priority order:
 * 1. LocalFileAdapter - Primary (user's local files)
 * 2. ManualAdapter - Templates for new components
 * 3. AIAgentAdapter - Remote AI API responses
 * 4. GitHubAdapter - Future (this file)
 * 5. FigmaAdapter - Future (design tool integration)
 */

import { ComponentSource } from '../../../common/storage/storageTypes.js';
import { SourceData, GitHubSourceData, ImportResult } from '../../../common/component/types.js';
import { BaseImportAdapter } from './types.js';

export class GitHubAdapter extends BaseImportAdapter {
	readonly sourceType: ComponentSource = 'github';

	async import(sourceData: SourceData): Promise<ImportResult> {
		if (sourceData.type !== 'github') {
			throw new Error('GitHubAdapter: Invalid source type');
		}

		const data = sourceData as GitHubSourceData;

		// TODO: Implement when GitHub import becomes priority
		// See documentation above for possible approaches

		throw new Error(
			`GitHubAdapter: Not yet implemented.\n` +
			`Requested: ${data.repoUrl} / ${data.filePath}\n\n` +
			`Workaround: Clone the repo locally, then use "Import from Local File" ` +
			`to import specific components.`
		);
	}
}
