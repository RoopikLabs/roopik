# Roo Code Evals - Windows Setup Summary

## ✅ What We Accomplished

You successfully got the Roo Code evaluation system running on Windows! This required significant modifications because the system was designed for Linux/Docker environments.

## 🔧 All Fixes Applied

### 1. Build System
- Built `@roo-code/build` package
- Fixed esbuild.mjs import paths
- Added proper package.json exports
- Built extension bundle with `pnpm bundle`

### 2. CLI Fixes
- Fixed extension path detection (searches for monorepo root)
- Fixed version.ts path resolution
- Added `__dirname` for ESM modules
- Set `ROO_CLI_ROOT` environment variable

### 3. Ripgrep Setup
- Added `@vscode/ripgrep` to root dependencies
- Ran postinstall script manually to download binary
- Fixed path resolution for ripgrep location

### 4. Database & Services
- Set up PostgreSQL and Redis via Docker Compose
- Fixed database connection strings
- Cloned evals repository to correct location

### 5. Web UI Fixes
- Fixed database port (5432 vs 5433)
- Fixed EVALS_REPO_PATH resolution
- **Added CLI execution support** (major fix!)
- Fixed log file paths for Windows
- Cloned evals to `/extensions/evals` for path compatibility

### 6. Model Configuration
- Switched from expensive Claude ($3-5/task) to free Gemini ($0/task)
- Configured OpenRouter API integration
- Set up proper model settings in runCi.ts

## 📊 Current Status

### ✅ Working
- Database and Redis running
- Web UI accessible at http://localhost:3446
- CLI execution method functional
- Individual exercise selection
- Test execution (runs complete)
- Results stored in database

### ⚠️ Limitations
- **Logs not visible in UI** - CLI logs go to terminal/temp file, not database
- **Tests failing** - Environment differences from Linux
- **Rate limits** - Free Gemini has ~10 requests/minute limit

## 🎯 How to Use

### Start Services
```bash
cd packages/evals
docker compose up -d db redis
```

### Start Web UI
```bash
pnpm --filter @roo-code/web-evals dev
```
Then open: http://localhost:3446

### Run Tests
1. Select "CLI" as execution method
2. Choose "Some" exercises
3. Select specific exercise (e.g., `go/alphametics`)
4. Click "Launch"

### View Logs
**Option 1**: Check terminal where Web UI is running
**Option 2**: Check temp log file:
```bash
type %TEMP%\roo-code-evals.log
```

**Option 3**: Run CLI directly to see real-time output:
```bash
cd packages/evals
pnpm cli --runId <ID>  # Get ID from Web UI
```

## ❓ Why Tests Are Failing

The evaluation system was designed for Linux environments. Tests may fail due to:

1. **Missing Language Runtimes**
   - Go, Java, JavaScript/Node, Python, Rust must be installed
   - Versions must match exercise requirements

2. **Path Differences**
   - Windows uses backslashes, Linux uses forward slashes
   - Some exercises may have hardcoded Linux paths

3. **Tool Availability**
   - Some exercises expect Linux-specific tools
   - Build systems may behave differently on Windows

4. **Rate Limits**
   - Free Gemini: ~10 requests/minute
   - Tests timeout if rate limited

5. **Environment Variables**
   - Some exercises may expect Linux environment variables

## 🚀 Recommended Setup (Official)

The Roo Code team recommends:

**For Development:**
- macOS or Linux
- Docker Desktop
- VSCode execution method

**For Production:**
- Linux server
- Docker containers
- Automated CI/CD pipeline

**Windows is NOT officially supported!**

## 💡 Workarounds for Windows

### Option 1: WSL2 (Recommended)
Run the entire setup in Windows Subsystem for Linux:
```bash
wsl --install Ubuntu
# Then follow Linux setup instructions
```

### Option 2: Docker Desktop + Linux Containers
Use Docker Desktop with Linux containers for full compatibility.

### Option 3: Continue with Current Setup
Accept that some tests will fail due to environment differences.
Focus on exercises that don't require Linux-specific features.

## 📝 Files Modified

All changes are documented in:
- `packages/evals/WINDOWS_SETUP.md` - Detailed setup guide
- `packages/evals/QUICKSTART.md` - Quick command reference
- `packages/evals/RUNNING_INDIVIDUAL_TESTS.md` - How to run specific tests

## 🎓 What You Learned

You now understand:
- How Roo Code's evaluation system works
- The difference between CLI, VSCode, and Docker execution methods
- How to debug and fix monorepo path issues
- How to adapt Linux-focused tools for Windows
- The importance of environment parity in testing systems

## 🏆 Achievement Unlocked!

You successfully ran an AI coding agent evaluation system on Windows, despite it being designed exclusively for Linux. This required:
- 20+ code modifications
- Path resolution fixes
- Environment configuration
- Database setup
- API integration

**Congratulations!** 🎉

## 📞 Next Steps

1. **Install language runtimes** if you want tests to pass
2. **Use WSL2** for better compatibility
3. **Upgrade to paid Gemini** to avoid rate limits
4. **Contribute fixes back** to help other Windows users

## 🔗 Resources

- Roo Code Evals Repo: https://github.com/RooCodeInc/Roo-Code-Evals
- OpenRouter: https://openrouter.ai/
- Gemini API: https://ai.google.dev/
