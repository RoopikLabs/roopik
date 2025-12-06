/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * AI Agent Import Adapter
 *
 * =============================================================================
 * WHEN TO USE THIS ADAPTER vs FILE WATCHER
 * =============================================================================
 *
 * There are TWO different scenarios for AI-generated components:
 *
 * -----------------------------------------------------------------------------
 * CASE 1: Remote/External AI APIs (USE THIS ADAPTER)
 * -----------------------------------------------------------------------------
 *
 * When AI returns code via API response (not writing to files):
 *
 *   User prompt: "Create a button component"
 *         ↓
 *   AI API returns: { code: "export default function Button() {...}" }
 *         ↓
 *   AIAgentAdapter.import({ type: 'ai-agent', code: '...' })
 *         ↓
 *   ImportResult { files, entryFile, framework, dependencies }
 *         ↓
 *   Caller stores files + builds component
 *
 * Examples:
 *   - Claude API / OpenAI API returning component code
 *   - Custom AI service returning generated components
 *   - MCP tools that return code as tool output
 *   - Any AI that gives us code as a string (not file writes)
 *
 * -----------------------------------------------------------------------------
 * CASE 2: Coding Agents (DO NOT USE THIS ADAPTER - Use FileWatcher)
 * -----------------------------------------------------------------------------
 *
 * When AI writes directly to file system (like a human developer):
 *
 *   Agent (Claude Code, Cursor, Copilot, our own agent)
 *         ↓
 *   Writes to: .roopik/canvases/{id}/components/{component}/src/Button.tsx
 *         ↓
 *   FileWatcher detects file change
 *         ↓
 *   Triggers rebuild via BuildService
 *         ↓
 *   Done! (No adapter needed)
 *
 * Why coding agents don't use this adapter:
 *   - They write files directly (just like human editing)
 *   - FileWatcher already handles this
 *   - Keeps agent code simple (just write files, no special API)
 *   - Works with ANY coding agent (Claude Code, Cursor, Gemini CLI, etc.)
 *
 * Our own Roopik Agent will also use this pattern:
 *   - Agent has tools to write files to component folder
 *   - Agent writes files → FileWatcher triggers → rebuild happens
 *   - Agent gets better context (can read existing files, see errors)
 *   - No special integration needed
 *
 * =============================================================================
 * SUMMARY
 * =============================================================================
 *
 * | Scenario              | Method          | Example                        |
 * |-----------------------|-----------------|--------------------------------|
 * | AI returns code string| AIAgentAdapter  | Claude API tool output         |
 * | AI writes to files    | FileWatcher     | Claude Code, Cursor, our agent |
 * | User imports file     | LocalFileAdapter| Import button, drag-drop       |
 * | User creates new      | ManualAdapter   | New component from template    |
 *
 */

import { ComponentSource } from '../../../common/storage/storageTypes.js';
import { SourceData, AIAgentSourceData, ImportResult } from '../../../common/component/types.js';
import { BaseImportAdapter } from './types.js';
import { ComponentParser } from '../../../common/sandboxPipeline/componentParser.js';

export class AIAgentAdapter extends BaseImportAdapter {
	readonly sourceType: ComponentSource = 'ai-agent';

	private readonly parser: ComponentParser;

	constructor() {
		super();
		this.parser = new ComponentParser();
	}

	async import(sourceData: SourceData): Promise<ImportResult> {
		if (sourceData.type !== 'ai-agent') {
			throw new Error('AIAgentAdapter: Invalid source type');
		}

		const data = sourceData as AIAgentSourceData;

		// Normalize to files map
		let files: Record<string, string>;

		if (data.files && Object.keys(data.files).length > 0) {
			// AI provided multiple files
			files = { ...data.files };
		} else if (data.code) {
			// AI provided single code string - need to infer filename
			const framework = this.parser.detectFramework({ 'temp.tsx': data.code });
			const filename = this.inferFilename(data.code, framework);
			files = { [filename]: data.code };
		} else {
			throw new Error('AIAgentAdapter: No code or files provided');
		}

		// Detect framework from all files
		const framework = this.parser.detectFramework(files);

		// Detect entry file
		const entryFile = this.parser.detectEntryFile(files, framework);

		// Detect dependencies from imports
		const dependencies = this.detectDependenciesFromFiles(files);

		return {
			files,
			entryFile,
			framework,
			dependencies,
			sourceInfo: {
				promptId: data.promptId,
				model: data.model
			}
		};
	}
}
