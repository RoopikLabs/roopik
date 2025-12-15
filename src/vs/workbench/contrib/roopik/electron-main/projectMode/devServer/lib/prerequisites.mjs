/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Roopik. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * Prerequisites Checker Module
 *
 * Pure validation functions that check if a project meets requirements
 * for running a dev server. Each check is independent and returns a
 * structured result.
 *
 * Design:
 * - Pure functions (no side effects except reading filesystem)
 * - Each check returns { ok, error?, data? }
 * - Composable - can run individual checks or full pipeline
 * - Framework-agnostic core with framework-specific detectors
 */

import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import { join } from 'path';

// ============================================
// Result Types
// ============================================

/**
 * @typedef {Object} CheckResult
 * @property {boolean} ok - Whether the check passed
 * @property {string} [error] - Error message if failed
 * @property {any} [data] - Data to pass forward if passed
 */

/**
 * Create a success result
 * @param {any} data - Data to include
 * @returns {CheckResult}
 */
export function ok(data = null) {
	return { ok: true, data };
}

/**
 * Create a failure result
 * @param {string} message - Error message
 * @returns {CheckResult}
 */
export function fail(message) {
	return { ok: false, error: message };
}

// ============================================
// Individual Checks
// ============================================

/**
 * Check if path exists and is a directory
 */
export function isValidDirectory(path) {
	if (!path || typeof path !== 'string') {
		return fail('Path is empty or invalid');
	}

	if (!existsSync(path)) {
		return fail(`Directory does not exist: ${path}`);
	}

	try {
		const stats = statSync(path);
		if (!stats.isDirectory()) {
			return fail(`Path is not a directory: ${path}`);
		}
		return ok({ path });
	} catch (error) {
		return fail(`Cannot access path: ${error.message}`);
	}
}

/**
 * Check if package.json exists and is valid JSON
 */
export function hasValidPackageJson(projectRoot) {
	const packageJsonPath = join(projectRoot, 'package.json');

	if (!existsSync(packageJsonPath)) {
		return fail('No package.json found. Is this a Node.js project?');
	}

	try {
		const content = readFileSync(packageJsonPath, 'utf-8');
		const packageJson = JSON.parse(content);

		return ok({
			packageJson,
			packageJsonPath,
			name: packageJson.name || 'unnamed',
			version: packageJson.version || '0.0.0'
		});
	} catch (error) {
		if (error instanceof SyntaxError) {
			return fail(`package.json is not valid JSON: ${error.message}`);
		}
		return fail(`Cannot read package.json: ${error.message}`);
	}
}

/**
 * Check if node_modules exists and is not empty
 */
export function hasNodeModules(projectRoot) {
	const nodeModulesPath = join(projectRoot, 'node_modules');

	if (!existsSync(nodeModulesPath)) {
		return fail('node_modules not found. Run "npm install" first.');
	}

	try {
		const stats = statSync(nodeModulesPath);
		if (!stats.isDirectory()) {
			return fail('node_modules exists but is not a directory');
		}

		// Check it's not empty
		const entries = readdirSync(nodeModulesPath);
		if (entries.length === 0) {
			return fail('node_modules is empty. Run "npm install" first.');
		}

		return ok({ nodeModulesPath, count: entries.length });
	} catch (error) {
		return fail(`Cannot access node_modules: ${error.message}`);
	}
}

/**
 * Check if a specific package is installed
 */
export function hasPackage(projectRoot, packageName) {
	const packagePath = join(projectRoot, 'node_modules', packageName);

	if (!existsSync(packagePath)) {
		return fail(`Package "${packageName}" is not installed`);
	}

	// Try to read its package.json for version info
	const pkgJsonPath = join(packagePath, 'package.json');
	try {
		if (existsSync(pkgJsonPath)) {
			const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
			return ok({
				name: packageName,
				version: pkgJson.version,
				path: packagePath
			});
		}
		return ok({ name: packageName, path: packagePath });
	} catch {
		return ok({ name: packageName, path: packagePath });
	}
}

/**
 * Check if Vite is installed and loadable
 */
export function hasVite(projectRoot) {
	const viteCheck = hasPackage(projectRoot, 'vite');
	if (!viteCheck.ok) {
		return fail('Vite is not installed. Run "npm install vite" first.');
	}

	// Try to require it to ensure it's loadable
	try {
		const vitePath = join(projectRoot, 'node_modules', 'vite');
		// We'll use dynamic import in the worker, here just check path exists
		const vitePackageJson = join(vitePath, 'package.json');
		if (!existsSync(vitePackageJson)) {
			return fail('Vite package is corrupted (no package.json)');
		}

		return ok({
			path: vitePath,
			version: viteCheck.data.version
		});
	} catch (error) {
		return fail(`Vite installation is broken: ${error.message}`);
	}
}

// ============================================
// Framework Detection
// ============================================

/**
 * Framework info structure
 * @typedef {Object} FrameworkInfo
 * @property {string} id - Framework identifier (e.g., 'react-vite')
 * @property {string} name - Display name (e.g., 'React (Vite)')
 * @property {string} bundler - Underlying bundler ('vite', 'webpack', 'turbopack')
 * @property {boolean} supported - Whether we support this framework
 * @property {boolean} supportsSourceTracking - Whether click-to-source works
 */

const FRAMEWORKS = {
	'react-vite': {
		id: 'react-vite',
		name: 'React (Vite)',
		bundler: 'vite',
		supported: true,
		supportsSourceTracking: true,
		detect: (deps) => deps['vite'] && (deps['react'] || deps['@vitejs/plugin-react'])
	},
	'vue-vite': {
		id: 'vue-vite',
		name: 'Vue 3 (Vite)',
		bundler: 'vite',
		supported: true,
		supportsSourceTracking: true,
		detect: (deps) => deps['vite'] && (deps['vue'] || deps['@vitejs/plugin-vue'])
	},
	'svelte-vite': {
		id: 'svelte-vite',
		name: 'Svelte (Vite)',
		bundler: 'vite',
		supported: true,
		supportsSourceTracking: true, // Now supported with svelteSourcePlugin
		detect: (deps) => deps['vite'] && (deps['svelte'] || deps['@sveltejs/vite-plugin-svelte'])
	},
	'solid-vite': {
		id: 'solid-vite',
		name: 'SolidJS (Vite)',
		bundler: 'vite',
		supported: true,
		supportsSourceTracking: true,
		detect: (deps) => deps['vite'] && (deps['solid-js'] || deps['vite-plugin-solid'])
	},
	'plain-html-vite': {
		id: 'plain-html-vite',
		name: 'Plain HTML (Vite)',
		bundler: 'vite',
		supported: true,
		supportsSourceTracking: true,
		detect: (deps) => deps['vite'] && !deps['react'] && !deps['vue'] && !deps['svelte'] && !deps['solid-js']
	},
	'nextjs': {
		id: 'nextjs',
		name: 'Next.js',
		bundler: 'turbopack',
		supported: false,
		supportsSourceTracking: false,
		detect: (deps) => deps['next']
	},
	'nuxt': {
		id: 'nuxt',
		name: 'Nuxt',
		bundler: 'vite',
		supported: false,
		supportsSourceTracking: false,
		detect: (deps) => deps['nuxt']
	},
	'sveltekit': {
		id: 'sveltekit',
		name: 'SvelteKit',
		bundler: 'vite',
		supported: false,
		supportsSourceTracking: false,
		detect: (deps) => deps['@sveltejs/kit']
	},
	'react-cra': {
		id: 'react-cra',
		name: 'Create React App',
		bundler: 'webpack',
		supported: false,
		supportsSourceTracking: false,
		detect: (deps) => deps['react-scripts']
	},
	'react-webpack': {
		id: 'react-webpack',
		name: 'React (Webpack)',
		bundler: 'webpack',
		supported: false,
		supportsSourceTracking: false,
		detect: (deps) => deps['webpack'] && deps['react'] && !deps['vite']
	},
	'vue-webpack': {
		id: 'vue-webpack',
		name: 'Vue (Webpack)',
		bundler: 'webpack',
		supported: false,
		supportsSourceTracking: false,
		detect: (deps) => deps['webpack'] && deps['vue'] && !deps['vite']
	}
};

/**
 * Detect framework from package.json dependencies
 */
export function detectFramework(packageJson) {
	const deps = {
		...packageJson.dependencies,
		...packageJson.devDependencies
	};

	// Check each framework in order (more specific first)
	for (const [id, framework] of Object.entries(FRAMEWORKS)) {
		if (framework.detect(deps)) {
			return ok(framework);
		}
	}

	return fail('Could not detect framework. Ensure your project uses a supported framework (Vite recommended).');
}

/**
 * Check if detected framework is supported
 */
export function isFrameworkSupported(framework) {
	if (!framework.supported) {
		return fail(`${framework.name} is not yet supported. Currently only Vite-based projects work.`);
	}
	return ok(framework);
}

// ============================================
// Pipeline
// ============================================

/**
 * Run all prerequisite checks in sequence
 * Returns first failure or success with all collected data
 */
export function runAllChecks(projectRoot) {
	const results = {
		projectRoot,
		checks: []
	};

	// Step 1: Valid directory
	const dirCheck = isValidDirectory(projectRoot);
	results.checks.push({ name: 'directory', ...dirCheck });
	if (!dirCheck.ok) {
		return { ok: false, error: dirCheck.error, results };
	}

	// Step 2: Valid package.json
	const pkgCheck = hasValidPackageJson(projectRoot);
	results.checks.push({ name: 'package.json', ...pkgCheck });
	if (!pkgCheck.ok) {
		return { ok: false, error: pkgCheck.error, results };
	}
	results.packageJson = pkgCheck.data.packageJson;
	results.projectName = pkgCheck.data.name;

	// Step 3: Detect framework
	const fwCheck = detectFramework(pkgCheck.data.packageJson);
	results.checks.push({ name: 'framework', ...fwCheck });
	if (!fwCheck.ok) {
		return { ok: false, error: fwCheck.error, results };
	}
	results.framework = fwCheck.data;

	// Step 4: Framework supported
	const supportCheck = isFrameworkSupported(fwCheck.data);
	results.checks.push({ name: 'framework-support', ...supportCheck });
	if (!supportCheck.ok) {
		return { ok: false, error: supportCheck.error, results };
	}

	// Step 5: node_modules exists
	const nmCheck = hasNodeModules(projectRoot);
	results.checks.push({ name: 'node_modules', ...nmCheck });
	if (!nmCheck.ok) {
		return { ok: false, error: nmCheck.error, results, needsInstall: true };
	}

	// Step 6: Vite installed (for Vite-based frameworks)
	if (results.framework.bundler === 'vite') {
		const viteCheck = hasVite(projectRoot);
		results.checks.push({ name: 'vite', ...viteCheck });
		if (!viteCheck.ok) {
			return { ok: false, error: viteCheck.error, results };
		}
		results.vite = viteCheck.data;
	}

	return { ok: true, results };
}
