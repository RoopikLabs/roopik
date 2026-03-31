#!/usr/bin/env node
/**
 * Sync From VS Code Upstream Tool
 *
 * Downloads changed files from specific commits in the upstream VS Code repo
 * and copies them to the correct location in your Roopik IDE repo.
 *
 * Usage:
 *   node sync-from-vscode-upstream.cjs <commit-or-range> [options]
 *
 * Examples:
 *   # Dry run (just list files, don't download)
 *   node sync-from-vscode-upstream.cjs abc1234 --dry-run
 *   node sync-from-vscode-upstream.cjs --last 5 --dry-run
 *
 *   # Sync a single commit
 *   node sync-from-vscode-upstream.cjs abc1234
 *
 *   # Sync a range of commits (from...to)
 *   node sync-from-vscode-upstream.cjs abc1234...def5678
 *
 *   # Sync last N commits from main branch
 *   node sync-from-vscode-upstream.cjs --last 5
 *
 *   # Preview changes (show diff)
 *   node sync-from-vscode-upstream.cjs abc1234 --preview
 *
 *   # Stage files for manual review (keeps original folder structure)
 *   node sync-from-vscode-upstream.cjs abc1234 --stage
 *
 * IMPORTANT NOTES for Range Commits:
 *   When using ranges (B..Z), ALWAYS use your LAST successfully synced commit as the start.
 *
 *   CORRECT:   node sync-from-vscode-upstream.cjs B..Z  (where B is your last sync)
 *   WRONG:     node sync-from-vscode-upstream.cjs C..Z  (you'll miss changes from commit C)
 *
 *   Why? The compare shows differences BETWEEN two commits, not changes SINCE a commit.
 *   If you synced up to B, and new commits are C,D,E...Z, use B..Z to get all changes after B.
 *
 *   Best Practice: Track your last sync
 *     echo "abc123" > .last-vscode-sync-commit
 *     # Later...
 *     LAST=$(cat .last-vscode-sync-commit)
 *     node sync-from-vscode-upstream.cjs $LAST..HEAD --dry-run
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
	// Upstream VS Code repo
	upstreamOwner: 'microsoft',
	upstreamRepo: 'vscode',
	upstreamBranch: 'main',

	// Your local repo paths
	localRepoRoot: path.resolve(__dirname, '..', '..'),

	// Staging directory for manual review (keeps original folder structure)
	stagingDir: path.resolve(__dirname, '..', '..', '.vscode-upstream-sync'),

	// Path mapping: upstream path -> local path
	// For VS Code fork, most files map 1:1 (no transformation needed)
	pathMapping: {
		// Files from upstream root go directly to local root
		'': '',
		// Add specific overrides if needed
		// 'src/vs/': 'src/vs/',
	},

	// Files/patterns to skip (Roopik-specific files we don't want overwritten)
	skipPatterns: [
		'.github/',
		'.vscode/',
		'CHANGELOG.md',
		'README.md',
		'.gitignore',
		'package-lock.json',
		// Roopik-specific paths
		'extensions/roopik-roo/',
		'docs/UPDATE_REBASE/',
		'docs/scripts/',
		'product.json', // We have custom branding
		'resources/linux/code.png',
		'resources/linux/code-icon.png',
		'resources/win32/code.ico',
		'resources/darwin/code.icns',
		// Add more patterns as needed
	],

	// GitHub API settings
	apiBase: 'api.github.com',
	rawBase: 'raw.githubusercontent.com',
};

// ANSI colors for terminal output
const colors = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	dim: '\x1b[2m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
};

function log(message, color = '') {
	console.log(`${color}${message}${colors.reset}`);
}

function logError(message) {
	console.error(`${colors.red}ERROR: ${message}${colors.reset}`);
}

function logSuccess(message) {
	log(`✓ ${message}`, colors.green);
}

function logInfo(message) {
	log(`ℹ ${message}`, colors.cyan);
}

function logWarning(message) {
	log(`⚠ ${message}`, colors.yellow);
}

/**
 * Make an HTTPS GET request
 */
function httpsGet(url, options = {}) {
	return new Promise((resolve, reject) => {
		const urlObj = new URL(url);
		const reqOptions = {
			hostname: urlObj.hostname,
			path: urlObj.pathname + urlObj.search,
			method: 'GET',
			headers: {
				'User-Agent': 'roopik-vscode-sync-tool',
				'Accept': 'application/vnd.github.v3+json',
				...options.headers,
			},
		};

		// Add GitHub token if available (for higher rate limits)
		if (process.env.GITHUB_TOKEN) {
			reqOptions.headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
		}

		const req = https.request(reqOptions, (res) => {
			let data = '';
			res.on('data', chunk => data += chunk);
			res.on('end', () => {
				if (res.statusCode >= 200 && res.statusCode < 300) {
					resolve({ data, statusCode: res.statusCode });
				} else {
					reject(new Error(`HTTP ${res.statusCode}: ${data}`));
				}
			});
		});

		req.on('error', reject);
		req.end();
	});
}

/**
 * Get commits from GitHub API
 */
async function getCommits(commitSpec) {
	const { upstreamOwner, upstreamRepo, apiBase } = CONFIG;

	// Normalize: accept both ".." and "..." syntax
	const normalizedSpec = commitSpec.replace('...', '..');

	// If it's a range (contains ..)
	if (normalizedSpec.includes('..')) {
		const [from, to] = normalizedSpec.split('..');
		const url = `https://${apiBase}/repos/${upstreamOwner}/${upstreamRepo}/compare/${from}...${to}`;
		const { data } = await httpsGet(url);
		const json = JSON.parse(data);
		return {
			commits: json.commits.map(c => c.sha),
			files: json.files.map(f => ({
				filename: f.filename,
				status: f.status,
				additions: f.additions,
				deletions: f.deletions,
			})),
		};
	}

	// Single commit
	const url = `https://${apiBase}/repos/${upstreamOwner}/${upstreamRepo}/commits/${commitSpec}`;
	const { data } = await httpsGet(url);
	const json = JSON.parse(data);
	return {
		commits: [json.sha],
		files: json.files.map(f => ({
			filename: f.filename,
			status: f.status,
			additions: f.additions,
			deletions: f.deletions,
		})),
	};
}

/**
 * Get latest N commits from main branch
 */
async function getLatestCommits(count) {
	const { upstreamOwner, upstreamRepo, upstreamBranch, apiBase } = CONFIG;
	const url = `https://${apiBase}/repos/${upstreamOwner}/${upstreamRepo}/commits?sha=${upstreamBranch}&per_page=${count}`;
	const { data } = await httpsGet(url);
	const commits = JSON.parse(data);

	// Get the oldest and newest commit from the list
	const oldest = commits[commits.length - 1].sha;
	const newest = commits[0].sha;

	// Now get the compare between them
	return getCommits(`${oldest}..${newest}`);
}

/**
 * Download a file from upstream
 */
async function downloadFile(filePath, commitSha) {
	const { upstreamOwner, upstreamRepo, rawBase } = CONFIG;
	const url = `https://${rawBase}/${upstreamOwner}/${upstreamRepo}/${commitSha}/${filePath}`;

	try {
		const { data } = await httpsGet(url);
		return data;
	} catch (error) {
		if (error.message.includes('404')) {
			return null; // File was deleted
		}
		throw error;
	}
}

/**
 * Map upstream path to local path
 */
function mapToLocalPath(upstreamPath) {
	const { localRepoRoot, pathMapping } = CONFIG;

	// Find the best matching prefix
	let localPath = upstreamPath;
	for (const [prefix, target] of Object.entries(pathMapping)) {
		if (upstreamPath.startsWith(prefix)) {
			localPath = target + upstreamPath.slice(prefix.length);
			break;
		}
	}

	return path.join(localRepoRoot, localPath);
}

/**
 * Check if a file should be skipped
 */
function shouldSkip(filePath) {
	return CONFIG.skipPatterns.some(pattern => {
		if (pattern.endsWith('/')) {
			return filePath.startsWith(pattern);
		}
		return filePath === pattern || filePath.endsWith('/' + pattern);
	});
}

/**
 * Ensure directory exists
 */
function ensureDir(filePath) {
	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
}

/**
 * Main sync function
 */
async function syncFromUpstream(commitSpec, options = {}) {
	const { dryRun = false, preview = false, stage = false } = options;

	log('\n' + '='.repeat(60), colors.bright);
	log('  Sync From Upstream VS Code', colors.bright + colors.cyan);
	log('='.repeat(60) + '\n', colors.bright);

	logInfo(`Fetching commit info for: ${commitSpec}`);

	let commitInfo;
	if (options.last) {
		commitInfo = await getLatestCommits(options.last);
	} else {
		commitInfo = await getCommits(commitSpec);
	}

	const { commits, files } = commitInfo;

	log(`\nFound ${colors.bright}${commits.length}${colors.reset} commit(s) with ${colors.bright}${files.length}${colors.reset} changed file(s)\n`);

	// Filter files
	const filesToSync = files.filter(f => !shouldSkip(f.filename));
	const skippedFiles = files.filter(f => shouldSkip(f.filename));

	if (skippedFiles.length > 0) {
		logWarning(`Skipping ${skippedFiles.length} file(s) based on skip patterns`);
		if (options.verbose) {
			for (const file of skippedFiles) {
				log(`  - ${file.filename}`, colors.dim);
			}
		}
	}

	// Summary by status
	const summary = {
		added: filesToSync.filter(f => f.status === 'added').length,
		modified: filesToSync.filter(f => f.status === 'modified').length,
		removed: filesToSync.filter(f => f.status === 'removed').length,
		renamed: filesToSync.filter(f => f.status === 'renamed').length,
	};

	log('\nChanges summary:');
	if (summary.added > 0) log(`  ${colors.green}+ ${summary.added} added${colors.reset}`);
	if (summary.modified > 0) log(`  ${colors.yellow}~ ${summary.modified} modified${colors.reset}`);
	if (summary.removed > 0) log(`  ${colors.red}- ${summary.removed} removed${colors.reset}`);
	if (summary.renamed > 0) log(`  ${colors.blue}→ ${summary.renamed} renamed${colors.reset}`);

	log('\nFiles to sync:');
	for (const file of filesToSync) {
		const statusIcon = {
			added: `${colors.green}+`,
			modified: `${colors.yellow}~`,
			removed: `${colors.red}-`,
			renamed: `${colors.blue}→`,
		}[file.status] || ' ';

		const localPath = mapToLocalPath(file.filename);
		const relativePath = path.relative(CONFIG.localRepoRoot, localPath);

		log(`  ${statusIcon} ${file.filename}${colors.reset}`);
		if (relativePath !== file.filename) {
			log(`    → ${relativePath}`, colors.dim);
		}
	}

	if (dryRun) {
		log('\n' + colors.yellow + 'DRY RUN - No files were changed' + colors.reset);
		return;
	}

	if (preview) {
		log('\n' + colors.yellow + 'PREVIEW MODE - Review the files above' + colors.reset);
		return;
	}

	// Confirm before proceeding
	const targetDir = stage ? CONFIG.stagingDir : CONFIG.localRepoRoot;
	const modeLabel = stage ? 'STAGING (original folder structure)' : 'DIRECT SYNC (to repo root)';

	log('\n' + colors.bright + `Mode: ${modeLabel}` + colors.reset);
	if (stage) {
		log(`Files will be downloaded to: ${colors.cyan}${CONFIG.stagingDir}${colors.reset}`);
		log('You can review and copy them to your repo manually.');
	}
	log('\nReady to sync files.');
	log('Press Ctrl+C to cancel, or wait 3 seconds to continue...\n');
	await new Promise(resolve => setTimeout(resolve, 3000));

	// Download and write files
	const latestCommit = commits[commits.length - 1];
	let successCount = 0;
	let errorCount = 0;

	// Clear staging directory if staging mode
	if (stage && fs.existsSync(CONFIG.stagingDir)) {
		fs.rmSync(CONFIG.stagingDir, { recursive: true });
	}

	for (const file of filesToSync) {
		// In stage mode, keep original folder structure
		// In normal mode, map to local paths
		const targetPath = stage
			? path.join(CONFIG.stagingDir, file.filename)
			: mapToLocalPath(file.filename);

		try {
			if (file.status === 'removed') {
				if (!stage && fs.existsSync(targetPath)) {
					fs.unlinkSync(targetPath);
					logSuccess(`Deleted: ${file.filename}`);
				} else if (stage) {
					// In stage mode, create a marker file for deleted files
					ensureDir(targetPath + '.DELETED');
					fs.writeFileSync(targetPath + '.DELETED', `This file was deleted in the upstream commit.\nOriginal path: ${file.filename}`);
					logSuccess(`Marked as deleted: ${file.filename}`);
				}
			} else {
				const content = await downloadFile(file.filename, latestCommit);
				if (content !== null) {
					ensureDir(targetPath);
					fs.writeFileSync(targetPath, content);
					logSuccess(`${stage ? 'Staged' : 'Synced'}: ${file.filename}`);
				} else {
					logWarning(`File not found (may have been deleted): ${file.filename}`);
				}
			}
			successCount++;
		} catch (error) {
			logError(`Failed to sync ${file.filename}: ${error.message}`);
			errorCount++;
		}
	}

	log('\n' + '='.repeat(60));
	log(`Sync complete: ${colors.green}${successCount} succeeded${colors.reset}, ${colors.red}${errorCount} failed${colors.reset}`);
	log('='.repeat(60) + '\n');

	// Save last synced commit
	if (!stage && successCount > 0) {
		const lastSyncFile = path.join(CONFIG.localRepoRoot, '.last-vscode-sync-commit');
		fs.writeFileSync(lastSyncFile, latestCommit);
		logInfo(`Saved last sync commit to .last-vscode-sync-commit: ${latestCommit.substring(0, 7)}`);
	}
}

/**
 * Parse command line arguments
 */
function parseArgs() {
	const args = process.argv.slice(2);
	const options = {
		commitSpec: null,
		dryRun: false,
		preview: false,
		stage: false,
		last: null,
		verbose: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === '--dry-run' || arg === '-n') {
			options.dryRun = true;
		} else if (arg === '--preview' || arg === '-p') {
			options.preview = true;
		} else if (arg === '--last' || arg === '-l') {
			options.last = parseInt(args[++i], 10);
		} else if (arg === '--stage' || arg === '-s') {
			options.stage = true;
		} else if (arg === '--verbose' || arg === '-v') {
			options.verbose = true;
		} else if (arg === '--help' || arg === '-h') {
			showHelp();
			process.exit(0);
		} else if (!arg.startsWith('-')) {
			options.commitSpec = arg;
		}
	}

	return options;
}

function showHelp() {
	console.log(`
${colors.bright}Sync From VS Code Upstream Tool${colors.reset}

Downloads changed files from specific commits in the upstream microsoft/vscode repo
and copies them to the correct location in your Roopik IDE repo.

${colors.bright}Usage:${colors.reset}
  node sync-from-vscode-upstream.cjs <commit-or-range> [options]

${colors.bright}Arguments:${colors.reset}
  <commit-or-range>    A commit SHA, or a range like "abc123..def456"

${colors.bright}Options:${colors.reset}
  --last, -l <N>       Sync the last N commits from main branch
  --stage, -s          Download to staging folder with ORIGINAL folder structure
                       (for manual review and copy/paste)
  --dry-run, -n        List files without downloading
  --preview, -p        Preview file mappings
  --verbose, -v        Show skipped files
  --help, -h           Show this help message

${colors.bright}Environment Variables:${colors.reset}
  GITHUB_TOKEN         GitHub personal access token for higher API rate limits

${colors.bright}Examples:${colors.reset}
  # Sync a single commit
  node sync-from-vscode-upstream.cjs abc1234

  # Sync a range of commits
  node sync-from-vscode-upstream.cjs abc1234..def5678

  # Sync last 5 commits
  node sync-from-vscode-upstream.cjs --last 5

  # Dry run to see what would change
  node sync-from-vscode-upstream.cjs abc1234 --dry-run

  # Stage files for manual review (keeps original folder structure)
  node sync-from-vscode-upstream.cjs abc1234 --stage
  # Files will be in .vscode-upstream-sync/ folder

${colors.bright}Skip Patterns:${colors.reset}
  The following paths are automatically skipped (Roopik-specific):
  - .github/, .vscode/
  - extensions/roopik-roo/
  - docs/UPDATE_REBASE/, docs/scripts/
  - product.json (custom branding)
  - Icon files (code.png, code.ico, code.icns)

${colors.bright}Configuration:${colors.reset}
  Edit the CONFIG object in this file to customize:
  - Upstream repo details
  - Path mappings
  - Skip patterns
`);
}

// Main entry point
(async () => {
	try {
		const options = parseArgs();

		if (!options.commitSpec && !options.last) {
			logError('Please provide a commit hash, range, or use --last <N>');
			showHelp();
			process.exit(1);
		}

		await syncFromUpstream(options.commitSpec, options);
	} catch (error) {
		logError(error.message);
		if (process.env.DEBUG) {
			console.error(error);
		}
		process.exit(1);
	}
})();
