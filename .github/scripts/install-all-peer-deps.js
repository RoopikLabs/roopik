#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EXTENSION_DIR = join(__dirname, '../../extensions/roopik-roo');

function findPackageJsonFiles(dir, depth = 0, maxDepth = 5) {
	if (depth > maxDepth) return [];

	const files = [];
	const nodeModulesPath = join(dir, 'node_modules');

	if (!existsSync(nodeModulesPath)) return files;

	try {
		const entries = readdirSync(nodeModulesPath, { withFileTypes: true });

		for (const entry of entries) {
			if (entry.isDirectory() && !entry.name.startsWith('.')) {
				const packageJsonPath = join(nodeModulesPath, entry.name, 'package.json');
				if (existsSync(packageJsonPath)) {
					files.push(packageJsonPath);
					const nested = findPackageJsonFiles(join(nodeModulesPath, entry.name), depth + 1, maxDepth);
					files.push(...nested);
				}
			}
		}
	} catch (err) {
		// Ignore errors
	}

	return files;
}

function extractPeerDependencies(packageJsonPath) {
	try {
		const content = readFileSync(packageJsonPath, 'utf8');
		const pkg = JSON.parse(content);

		if (pkg.peerDependencies) {
			return Object.entries(pkg.peerDependencies).map(([name, version]) => ({
				name,
				version: typeof version === 'string' ? version : version || '*',
				source: pkg.name || packageJsonPath
			}));
		}
	} catch (err) {
		// Ignore parse errors
	}

	return [];
}

function collectAllPeerDependencies(extensionDir) {
	console.log('Scanning for peer dependencies...');

	const packageJsonFiles = findPackageJsonFiles(extensionDir);
	console.log(`Found ${packageJsonFiles.length} package.json files`);

	const peerDeps = new Map();

	for (const pkgPath of packageJsonFiles) {
		const deps = extractPeerDependencies(pkgPath);
		for (const dep of deps) {
			if (!peerDeps.has(dep.name) || dep.version !== '*') {
				peerDeps.set(dep.name, dep.version);
			}
		}
	}

	return Array.from(peerDeps.entries()).map(([name, version]) => ({ name, version }));
}

function installPeerDependencies(extensionDir, peerDeps) {
	if (peerDeps.length === 0) {
		console.log('No peer dependencies found');
		return;
	}

	console.log(`\nFound ${peerDeps.length} peer dependencies:`);
	peerDeps.forEach(({ name, version }) => {
		console.log(`  - ${name}@${version}`);
	});

	console.log('\nInstalling peer dependencies...');

	const packages = peerDeps.map(({ name, version }) => `${name}@${version}`).join(' ');

	try {
		execSync(
			`npm install ${packages} --legacy-peer-deps --no-save`,
			{
				cwd: extensionDir,
				stdio: 'inherit',
				shell: true
			}
		);
		console.log('\nPeer dependencies installed successfully');
	} catch (err) {
		console.error('\nFailed to install some peer dependencies');
		console.error('Some may already be installed or have conflicts');
	}
}

function main() {
	console.log('Auto-installing peer dependencies\n');
	console.log(`Extension directory: ${EXTENSION_DIR}\n`);

	if (!existsSync(EXTENSION_DIR)) {
		console.error(`Extension directory not found: ${EXTENSION_DIR}`);
		process.exit(1);
	}

	const nodeModulesPath = join(EXTENSION_DIR, 'node_modules');
	if (!existsSync(nodeModulesPath)) {
		console.log('node_modules not found. Installing dependencies first...');
		try {
			execSync('npm install --legacy-peer-deps', {
				cwd: EXTENSION_DIR,
				stdio: 'inherit',
				shell: true
			});
		} catch (err) {
			console.error('Failed to install dependencies');
			process.exit(1);
		}
	}

	const peerDeps = collectAllPeerDependencies(EXTENSION_DIR);
	installPeerDependencies(EXTENSION_DIR, peerDeps);
}

main();

