#!/usr/bin/env node
/**
 * Sync Tool Schemas from Main Codebase
 *
 * This script copies tool schema definitions from the single source of truth
 * (src/vs/workbench/contrib/roopik/electron-main/mcp/toolSchemas.ts)
 * to the STDIO binary's tools.ts file.
 *
 * Run: npm run sync-schemas
 *
 * This ensures DRY principle - tool definitions are maintained in one place.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_FILE = path.resolve(__dirname, '../../../../src/vs/workbench/contrib/roopik/electron-main/mcp/toolSchemas.ts');
const TARGET_FILE = path.resolve(__dirname, '../src/tools.ts');

function syncSchemas() {
	console.log('🔄 Syncing tool schemas...');
	console.log(`   Source: ${SOURCE_FILE}`);
	console.log(`   Target: ${TARGET_FILE}`);

	// Read source file
	if (!fs.existsSync(SOURCE_FILE)) {
		console.error('❌ Source file not found:', SOURCE_FILE);
		process.exit(1);
	}

	const sourceContent = fs.readFileSync(SOURCE_FILE, 'utf8');

	// Read existing target to preserve PROMPT_DEFINITIONS
	let existingPrompts = '';
	if (fs.existsSync(TARGET_FILE)) {
		const targetContent = fs.readFileSync(TARGET_FILE, 'utf8');
		// Find PROMPT_DEFINITIONS section
		const promptMatch = targetContent.match(/\/\/ =+\s*\n\/\/ Prompt Definitions[\s\S]*$/);
		if (promptMatch) {
			existingPrompts = '\n' + promptMatch[0];
		}
	}

	// Process source content
	let processedContent = sourceContent
		// Update header comment
		.replace(/\/\*[\s\S]*?\*\//, `/**
 * Tool Definitions
 *
 * AUTO-GENERATED from toolSchemas.ts - DO NOT EDIT DIRECTLY!
 * Run 'npm run sync-schemas' to update from source.
 *
 * Source: src/vs/workbench/contrib/roopik/electron-main/mcp/toolSchemas.ts
 */`)
		// Remove the helper function that's only used by WebSocket MCP
		.replace(/\/\/ =+\s*\n\/\/ Helper:[\s\S]*$/, '')
		// index.ts extracts .shape via classic zod — generated schemas must use the same import
		.replace(/from 'zod\/v4'/g, "from 'zod'");

	// Add prompts back
	processedContent = processedContent.trimEnd() + '\n' + existingPrompts;

	// Write to target
	fs.writeFileSync(TARGET_FILE, processedContent);

	console.log('✅ Tool schemas synced successfully!');
	console.log('   Remember to rebuild the binary: npm run build:binary:win');
}

syncSchemas();
