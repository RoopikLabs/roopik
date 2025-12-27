#!/usr/bin/env node

/**
 * Script to update branding from VS Code to Roopik after rebasing
 * Run this script after each rebase: node docs/UPDATE_REBASE/update-branding.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get project root (go up two levels from docs/UPDATE_REBASE/)
const ROOT_DIR = path.resolve(__dirname, '../..');

// Define all the branding replacements
const BRANDING_UPDATES = [
	// Windows Installer - code.iss
	{
		file: 'build/win32/code.iss',
		replacements: [
			{
				search: /AppPublisher=Microsoft Corporation/g,
				replace: 'AppPublisher=Roopik Labs'
			},
			{
				search: /AppPublisherURL=https:\/\/code\.visualstudio\.com\//g,
				replace: 'AppPublisherURL=https://roopik.com/'
			},
			{
				search: /AppSupportURL=https:\/\/code\.visualstudio\.com\//g,
				replace: 'AppSupportURL=https://roopik.com/support'
			},
			{
				search: /AppUpdatesURL=https:\/\/code\.visualstudio\.com\//g,
				replace: 'AppUpdatesURL=https://roopik.com/updates'
			},
			{
				search: /OutputBaseFilename=VSCodeSetup/g,
				replace: 'OutputBaseFilename=RoopikSetup'
			},
			{
				search: /download the System Installer instead from https:\/\/code\.visualstudio\.com/g,
				replace: 'download the System Installer instead from https://roopik.com'
			},
			{
				search: /install VS Code for all users/g,
				replace: 'install Roopik for all users'
			}
		]
	},
	// Windows Installer - code-insider.iss
	{
		file: 'build/win32/code-insider.iss',
		replacements: [
			{
				search: /AppPublisher=Microsoft Corporation/g,
				replace: 'AppPublisher=Roopik Labs'
			},
			{
				search: /AppPublisherURL=https:\/\/code\.visualstudio\.com\//g,
				replace: 'AppPublisherURL=https://roopik.com/'
			},
			{
				search: /AppSupportURL=https:\/\/code\.visualstudio\.com\//g,
				replace: 'AppSupportURL=https://roopik.com/support'
			},
			{
				search: /AppUpdatesURL=https:\/\/code\.visualstudio\.com\//g,
				replace: 'AppUpdatesURL=https://roopik.com/updates'
			},
			{
				search: /OutputBaseFilename=VSCodeSetup/g,
				replace: 'OutputBaseFilename=RoopikSetup'
			},
			{
				search: /download the System Installer instead from https:\/\/code\.visualstudio\.com/g,
				replace: 'download the System Installer instead from https://roopik.com'
			},
			{
				search: /install VS Code for all users/g,
				replace: 'install Roopik for all users'
			}
		]
	},
	// Linux DEB - control.template
	{
		file: 'resources/linux/debian/control.template',
		replacements: [
			{
				search: /Maintainer: Microsoft Corporation <vscode-linux@microsoft\.com>/g,
				replace: 'Maintainer: Roopik Labs <support@roopik.com>'
			},
			{
				search: /Homepage: https:\/\/code\.visualstudio\.com\//g,
				replace: 'Homepage: https://roopik.com/'
			},
			{
				search: /Description: Code editing\. Redefined\./g,
				replace: 'Description: AI-Native Canvas-First IDE'
			},
			{
				search: /Visual Studio Code is a new choice of tool that combines the simplicity of\s+a code editor with what developers need for the core edit-build-debug cycle\.\s+See https:\/\/code\.visualstudio\.com\/docs\/setup\/linux for installation\s+instructions and FAQ\./g,
				replace: 'Roopik is an AI-native, canvas-first IDE built for modern development.\n See https://roopik.com for installation instructions and FAQ.'
			}
		]
	},
	// Linux Snap - snapcraft.yaml
	{
		file: 'resources/linux/snap/snapcraft.yaml',
		replacements: [
			{
				search: /summary: Code editing\. Redefined\./g,
				replace: 'summary: AI-Native Canvas-First IDE'
			},
			{
				search: /description: \|\s+Visual Studio Code is a new choice of tool that combines the\s+simplicity of a code editor with what developers need for the core\s+edit-build-debug cycle\./g,
				replace: 'description: |\n  Roopik is an AI-native, canvas-first IDE built for modern development.'
			}
		]
	},
	// Linux RPM - code.spec.template
	{
		file: 'resources/linux/rpm/code.spec.template',
		replacements: [
			{
				search: /Summary:  Code editing\. Redefined\./g,
				replace: 'Summary:  AI-Native Canvas-First IDE'
			},
			{
				search: /Vendor:   Microsoft Corporation/g,
				replace: 'Vendor:   Roopik Labs'
			},
			{
				search: /Packager: Visual Studio Code Team <vscode-linux@microsoft\.com>/g,
				replace: 'Packager: Roopik Labs <support@roopik.com>'
			},
			{
				search: /URL:      https:\/\/code\.visualstudio\.com\//g,
				replace: 'URL:      https://roopik.com/'
			},
			{
				search: /Visual Studio Code is a new choice of tool that combines the simplicity of a code editor with what developers need for the core edit-build-debug cycle\. See https:\/\/code\.visualstudio\.com\/docs\/setup\/linux for installation instructions and FAQ\./g,
				replace: 'Roopik is an AI-native, canvas-first IDE built for modern development. See https://roopik.com for installation instructions and FAQ.'
			}
		]
	},
	// Linux AppData - code.appdata.xml
	{
		file: 'resources/linux/code.appdata.xml',
		replacements: [
			{
				search: /<url type="homepage">https:\/\/code\.visualstudio\.com<\/url>/g,
				replace: '<url type="homepage">https://roopik.com</url>'
			},
			{
				search: /<summary>Visual Studio Code\. Code editing\. Redefined\.<\/summary>/g,
				replace: '<summary>Roopik. AI-Native Canvas-First IDE.</summary>'
			},
			{
				search: /<p>Visual Studio Code is a new choice of tool that combines the simplicity of a code editor with what developers need for the core edit-build-debug cycle\. See https:\/\/code\.visualstudio\.com\/docs\/setup\/linux for installation instructions and FAQ\.<\/p>/g,
				replace: '<p>Roopik is an AI-native, canvas-first IDE built for modern development. See https://roopik.com for installation instructions and FAQ.</p>'
			},
			{
				search: /<image>https:\/\/code\.visualstudio\.com\/home\/home-screenshot-linux-lg\.png<\/image>/g,
				replace: '<image>https://roopik.com/screenshot.png</image>'
			},
			{
				search: /<caption>Editing TypeScript and searching for extensions<\/caption>/g,
				replace: '<caption>Roopik IDE interface</caption>'
			}
		]
	}
];

function updateFile(filePath, replacements) {
	const fullPath = path.join(ROOT_DIR, filePath);

	if (!fs.existsSync(fullPath)) {
		console.warn(`⚠️  File not found: ${filePath}`);
		return false;
	}

	let content = fs.readFileSync(fullPath, 'utf8');
	let modified = false;
	let changeCount = 0;

	for (const { search, replace } of replacements) {
		if (search.test(content)) {
			content = content.replace(search, replace);
			modified = true;
			changeCount++;
		}
	}

	if (modified) {
		fs.writeFileSync(fullPath, content, 'utf8');
		console.log(`✅ Updated ${filePath} (${changeCount} changes)`);
		return true;
	} else {
		console.log(`ℹ️  No changes needed: ${filePath}`);
		return false;
	}
}

function main() {
	console.log('🔄 Updating branding files...\n');

	let totalUpdated = 0;
	let totalSkipped = 0;
	let totalNotFound = 0;

	for (const { file, replacements } of BRANDING_UPDATES) {
		const result = updateFile(file, replacements);
		if (result === true) {
			totalUpdated++;
		} else if (result === false) {
			const fullPath = path.join(ROOT_DIR, file);
			if (fs.existsSync(fullPath)) {
				totalSkipped++;
			} else {
				totalNotFound++;
			}
		}
	}

	console.log('\n' + '='.repeat(50));
	console.log('📊 Summary:');
	console.log(`   ✅ Updated: ${totalUpdated} files`);
	console.log(`   ℹ️  No changes: ${totalSkipped} files`);
	console.log(`   ⚠️  Not found: ${totalNotFound} files`);
	console.log('='.repeat(50));

	if (totalUpdated > 0) {
		console.log('\n✨ Branding update complete!');
	} else if (totalNotFound > 0) {
		console.log('\n⚠️  Some files were not found. Make sure you\'re running this from the project root.');
		process.exit(1);
	} else {
		console.log('\n✨ All files already have Roopik branding!');
	}
}

// Run the script
main();

