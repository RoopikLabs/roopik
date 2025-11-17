/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ComponentSource } from '../core/types';

/**
 * AI Generator - Implements the "Golden Prompt"
 *
 * Generates component code with embedded dependency manifest
 * Phase 1: Focus on AI-generated components
 */
export class AIGenerator {
	/**
	 * Generate the "Golden Prompt" for AI
	 * This is the explicit, machine-readable prompt sent to Claude
	 */
	static createGoldenPrompt(componentDescription: string, variationCount: number = 1): string {
		return `Generate ${variationCount} variation(s) of a "${componentDescription}" using React and any UI libraries you think fit best.

CRITICAL REQUIREMENTS:

1. Provide each variation as a **separate, single, isolated .jsx file**.

2. The code **MUST** be standard, modern React code.

3. The code **MUST** use \`import\` statements for all dependencies (e.g., \`import { Button } from '@mui/material';\`).

4. The code **MUST** have a \`default export\`.

**DEPENDENCY MANIFEST (VERY IMPORTANT):**
At the *very top* of each file, you **MUST** include a JSON comment block that maps *every* imported package to its CDN URL and the global variable it creates. The CDN URL **MUST** include a specific version.

**EXAMPLE MANIFEST:**

\`\`\`jsx
// DEPENDENCIES: [
//   { "npm": "react", "global": "React", "url": "https://unpkg.com/react@18.2.0/umd/react.production.min.js" },
//   { "npm": "react-dom", "global": "ReactDOM", "url": "https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js" },
//   { "npm": "@mui/material", "global": "MaterialUI", "url": "https://unpkg.com/@mui/material@5.15.14/umd/material-ui.production.min.js" }
// ]

import React, { useState } from 'react';
import { Button, TextField } from '@mui/material';

export default function MyComponent() {
  return <div>...</div>;
}
\`\`\`

Generate production-ready, well-structured code with proper styling and interactivity.`;
	}

	/**
	 * Parse AI response into ComponentSource objects
	 * Extracts code blocks and creates ComponentSource for each variation
	 */
	static parseAIResponse(aiResponse: string): ComponentSource[] {
		const components: ComponentSource[] = [];

		// Extract code blocks (```jsx ... ```)
		const codeBlockRegex = /```jsx\n([\s\S]*?)\n```/g;
		let match;
		let index = 0;

		while ((match = codeBlockRegex.exec(aiResponse)) !== null) {
			const code = match[1];
			components.push({
				id: `component_${Date.now()}_${index}`,
				code: code.trim(),
				dependencies: [] // Will be parsed by PreviewManager
			});
			index++;
		}

		return components;
	}

	/**
	 * TODO: Integration with Claude API
	 * This will be implemented when we add AI integration
	 */
	static async generateComponent(_description: string, _variations: number = 1): Promise<ComponentSource[]> {
		// Placeholder for Phase 1.2 (AI Integration)
		throw new Error('AI integration not yet implemented. Use mock data for now.');
	}
}
