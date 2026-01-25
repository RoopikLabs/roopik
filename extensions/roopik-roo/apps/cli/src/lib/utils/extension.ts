import path from "path"
import fs from "fs"

/**
 * Get the default path to the extension bundle.
 * This assumes the CLI is installed alongside the built extension.
 *
 * @param dirname - The __dirname equivalent for the calling module
 */
export function getDefaultExtensionPath(dirname: string): string {
	// Check for environment variable first (set by install script)
	if (process.env.ROO_EXTENSION_PATH) {
		const envPath = process.env.ROO_EXTENSION_PATH

		if (fs.existsSync(path.join(envPath, "extension.js"))) {
			return envPath
		}
	}

	// Search upward for the monorepo root (contains package.json with name "roodio")
	let currentDir = dirname
	while (currentDir !== path.dirname(currentDir)) {
		const packageJsonPath = path.join(currentDir, "package.json")
		if (fs.existsSync(packageJsonPath)) {
			try {
				const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"))
				if (pkg.name === "roodio") {
					// Found the root! Check for dist/extension.js
					const distPath = path.join(currentDir, "dist")
					if (fs.existsSync(path.join(distPath, "extension.js"))) {
						return distPath
					}
				}
			} catch {
				// Ignore JSON parse errors
			}
		}
		currentDir = path.dirname(currentDir)
	}

	// Fallback: when installed via curl script, extension is at ../extension
	const packagePath = path.resolve(dirname, "../extension")
	return packagePath
}
