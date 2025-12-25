import * as esbuild from "esbuild"
import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"
import process from "node:process"
import * as console from "node:console"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Inline copy utilities (replaced @roo-code/build)
function copyFileSync(src, dst) {
	fs.mkdirSync(path.dirname(dst), { recursive: true })
	fs.copyFileSync(src, dst)
}

function copyDirSync(src, dst) {
	fs.mkdirSync(dst, { recursive: true })
	const entries = fs.readdirSync(src, { withFileTypes: true })
	for (const entry of entries) {
		const srcPath = path.join(src, entry.name)
		const dstPath = path.join(dst, entry.name)
		if (entry.isDirectory()) {
			copyDirSync(srcPath, dstPath)
		} else {
			fs.copyFileSync(srcPath, dstPath)
		}
	}
}

function copyPaths(paths, srcDir, dstDir) {
	paths.forEach(([srcRel, dstRel, options = {}]) => {
		const srcPath = path.join(srcDir, srcRel)
		const dstPath = path.join(dstDir, dstRel)

		if (!fs.existsSync(srcPath)) {
			if (options.optional) return
			throw new Error(`Source not found: ${srcPath}`)
		}

		const stats = fs.lstatSync(srcPath)
		if (stats.isDirectory()) {
			copyDirSync(srcPath, dstPath)
		} else {
			copyFileSync(srcPath, dstPath)
		}
	})
}

function copyWasms(srcDir, distDir) {
	// Copy WASM files for tree-sitter
	const wasmSrc = path.join(srcDir, "node_modules/tree-sitter-wasms")
	const wasmDst = path.join(distDir, "tree-sitter-wasms")
	if (fs.existsSync(wasmSrc)) {
		copyDirSync(wasmSrc, wasmDst)
	}

	// Copy web-tree-sitter WASM
	const webTreeSitterSrc = path.join(srcDir, "node_modules/web-tree-sitter/tree-sitter.wasm")
	const webTreeSitterDst = path.join(distDir, "tree-sitter.wasm")
	if (fs.existsSync(webTreeSitterSrc)) {
		copyFileSync(webTreeSitterSrc, webTreeSitterDst)
	}
}

function copyLocales(srcDir, distDir) {
	// Copy locale files
	const localeFiles = fs.readdirSync(srcDir).filter(f => f.startsWith("package.nls") && f.endsWith(".json"))
	localeFiles.forEach(file => {
		copyFileSync(path.join(srcDir, file), path.join(distDir, file))
	})
}

function setupLocaleWatcher(srcDir, distDir) {
	// Watcher setup (not needed for one-time builds)
	return () => { }
}

async function main() {
	const name = "extension"
	const production = process.argv.includes("--production")
	const watch = process.argv.includes("--watch")
	const minify = production
	const sourcemap = true // Always generate source maps for error handling

	/**
	 * @type {import('esbuild').BuildOptions}
	 */
	const buildOptions = {
		bundle: true,
		minify,
		sourcemap,
		logLevel: "silent",
		format: "cjs",
		sourcesContent: false,
		platform: "node",
	}

	const rootDir = __dirname  // extensions/roopik-dio/
	const srcDir = path.join(rootDir, "src")
	const distDir = path.join(srcDir, "dist")

	if (fs.existsSync(distDir)) {
		console.log(`[${name}] Cleaning dist directory: ${distDir}`)
		fs.rmSync(distDir, { recursive: true, force: true })
	}

	/**
	 * @type {import('esbuild').Plugin[]}
	 */
	const plugins = [
		{
			name: "resolve-paths",
			setup(build) {
				// Resolve @roo-code/* imports to local packages (packages/ is at root, not src/)
				build.onResolve({ filter: /^@roo-code\// }, args => {
					const packageName = args.path.replace('@roo-code/', '')
					return {
						path: path.join(rootDir, 'packages', packageName, 'src', 'index.ts'),
					}
				})
			},
		},
		{
			name: "copyFiles",
			setup(build) {
				build.onEnd(() => {
					copyPaths(
						[
							["README.md", "README.md"],
							["CHANGELOG.md", "CHANGELOG.md"],
							["LICENSE", "LICENSE"],
							["node_modules/vscode-material-icons/generated", "assets/vscode-material-icons"],
							["webview-ui/audio", "webview-ui/audio"],
						],
						rootDir,
						distDir,
					)
					// Copy files from src to dist
					copyPaths(
						[
							[".env", ".env", { optional: true }],
							["i18n/locales", "i18n/locales"],
						],
						srcDir,
						distDir,
					)
				})
			},
		},
		{
			name: "copyWasms",
			setup(build) {
				build.onEnd(() => copyWasms(srcDir, distDir))
			},
		},
		{
			name: "copyLocales",
			setup(build) {
				build.onEnd(() => copyLocales(srcDir, distDir))
			},
		},
		{
			name: "esbuild-problem-matcher",
			setup(build) {
				build.onStart(() => console.log("[esbuild-problem-matcher#onStart]"))
				build.onEnd((result) => {
					result.errors.forEach(({ text, location }) => {
						console.error(`✘ [ERROR] ${text}`)
						if (location && location.file) {
							console.error(`    ${location.file}:${location.line}:${location.column}:`)
						}
					})

					console.log("[esbuild-problem-matcher#onEnd]")
				})
			},
		},
	]

	/**
	 * @type {import('esbuild').BuildOptions}
	 */
	const extensionConfig = {
		...buildOptions,
		plugins,
		entryPoints: [path.join(srcDir, "extension.ts")],
		outfile: path.join(distDir, "extension.js"),
		external: ["vscode"],
	}

	/**
	 * @type {import('esbuild').BuildOptions}
	 */
	const workerConfig = {
		...buildOptions,
		entryPoints: [path.join(srcDir, "workers/countTokens.ts")],
		outdir: path.join(distDir, "workers"),
	}

	const [extensionCtx, workerCtx] = await Promise.all([
		esbuild.context(extensionConfig),
		esbuild.context(workerConfig),
	])

	if (watch) {
		await Promise.all([extensionCtx.watch(), workerCtx.watch()])
		copyLocales(srcDir, distDir)
		setupLocaleWatcher(srcDir, distDir)
	} else {
		await Promise.all([extensionCtx.rebuild(), workerCtx.rebuild()])
		await Promise.all([extensionCtx.dispose(), workerCtx.dispose()])
	}
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
