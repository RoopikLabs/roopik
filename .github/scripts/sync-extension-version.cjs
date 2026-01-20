#!/usr/bin/env node

/**
 * Sync Extension Version Script
 *
 * Automatically syncs the extension version from extensions/roopik-roo/package.json
 * to the builtInExtensions array in product.json.
 *
 * This ensures the IDE build downloads the correct version from the marketplace.
 *
 * Usage:
 *   node .github/scripts/sync-extension-version.cjs
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..', '..');
const PRODUCT_JSON_PATH = path.join(ROOT_DIR, 'product.json');
const EXTENSION_PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'extensions', 'roopik-roo', 'package.json');

function syncVersion() {
	try {
		// Read extension package.json
		const extensionPackage = JSON.parse(fs.readFileSync(EXTENSION_PACKAGE_JSON_PATH, 'utf8'));
		const extensionVersion = extensionPackage.version;

		if (!extensionVersion) {
			console.error('Error: Could not find version in extension package.json');
			process.exit(1);
		}

		// Read product.json
		const productJson = JSON.parse(fs.readFileSync(PRODUCT_JSON_PATH, 'utf8'));

		// Find the roopik.roodio extension in builtInExtensions
		const roodioExtension = productJson.builtInExtensions?.find(ext => ext.name === 'roopik.roodio');

		if (!roodioExtension) {
			console.error('Error: Could not find roopik.roodio extension in product.json builtInExtensions');
			process.exit(1);
		}

		const currentProductVersion = roodioExtension.version;

		if (currentProductVersion === extensionVersion) {
			console.log(`Versions already in sync: ${extensionVersion}`);
			return;
		}

		// Update the version
		roodioExtension.version = extensionVersion;

		// Write back to product.json
		fs.writeFileSync(PRODUCT_JSON_PATH, JSON.stringify(productJson, null, '\t') + '\n', 'utf8');

		console.log(`Updated product.json version: ${currentProductVersion} -> ${extensionVersion}`);

	} catch (error) {
		console.error('Error syncing version:', error.message);
		process.exit(1);
	}
}

syncVersion();
