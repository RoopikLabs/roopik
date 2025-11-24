# Roopik Logging Guide

## Overview

Roopik uses VSCode's **ILoggerService** pattern for production-ready logging. This provides:
- ✅ Automatic logging to **Output Panel** (user-visible)
- ✅ Automatic logging to **log files** (7-day retention)
- ✅ Zero configuration - VSCode handles everything
- ✅ Standard pattern used by VSCode's built-in services

---

## Two Logging Systems

### 1. Logger (Production - Output Panel)

**Use for:** User-facing logs that should persist and be accessible to users

```typescript
import { RoopikLogger } from '../common/roopikLogger.js';
import { ILoggerService } from '../../../../platform/log/common/log.js';

const loggerService = accessor.get(ILoggerService);
const logger = RoopikLogger.create(loggerService);

logger.info('[Roopik] Feature activated');    // Shows in Output Panel
logger.warn('[Roopik] Deprecation notice');   // Shows in Output Panel
logger.error('[Roopik] Operation failed');    // Shows in Output Panel
```

**Output Location:**
- ✅ **Output Panel**: `View → Output → "Roopik"` (user-visible)
- ✅ **Log File**: `%APPDATA%\Code\logs\<timestamp>\roopik.log`
- ❌ **Developer Console**: No (not shown by default)

---

### 2. Console.log (Development - Developer Console)

**Use for:** Debugging VSCode UI, temporary debug statements

```typescript
console.log('[Roopik] Debugging canvas state:', state);
console.error('[Roopik] UI error:', error);
```

**Output Location:**
- ✅ **Developer Console**: `Help → Toggle Developer Tools`
- ❌ **Output Panel**: No
- ❌ **Log File**: No

---

## Quick Start

```typescript
import { RoopikLogger } from '../common/roopikLogger.js';
import { ILoggerService } from '../../../../platform/log/common/log.js';

// In any command or service
async run(accessor: ServicesAccessor): Promise<void> {
    const loggerService = accessor.get(ILoggerService);
    const logger = RoopikLogger.create(loggerService);

    // Production logging (Output Panel + file)
    logger.info('[Roopik] Canvas opened');
    logger.warn('[Roopik] Canvas format is outdated');
    logger.error('[Roopik] Failed to save canvas', error);
    logger.debug('[Roopik] Canvas state loaded');

    // Development logging (Developer Console only)
    console.log('[Roopik] Canvas render complete');
}
```

---

## Log Levels

| Level | Method | When to Use | Visibility |
|-------|--------|-------------|------------|
| **INFO** | `logger.info()` | Feature activation, user actions, success messages | Always visible in Output Panel |
| **WARN** | `logger.warn()` | Recoverable errors, deprecations, warnings | Always visible in Output Panel |
| **ERROR** | `logger.error()` | Errors, exceptions, failures | Always visible in Output Panel |
| **DEBUG** | `logger.debug()` | Development debugging, state inspection | Only visible if user sets log level to Debug |

---

## Output Format

### Output Panel (User-Facing)
```
[14:23:45] [Roopik] Canvas opened
[14:23:47] [Roopik] Failed to load project
Error: Project file not found
    at loadProject (roopik.js:123)
```

### Log File (Same as Output Panel)
```
2025-11-24 14:23:45.123 [info] [Roopik] Canvas opened
2025-11-24 14:23:47.456 [error] [Roopik] Failed to load project
Error: Project file not found
    at loadProject (roopik.js:123)
```

---

## Best Practices

### 1. Always Prefix Messages with `[Roopik]`

```typescript
// ✅ Good - Easy to identify Roopik logs
logger.info('[Roopik] Canvas opened');
logger.error('[Roopik] Failed to save', error);

// ❌ Bad - Unclear source
logger.info('Canvas opened');
```

### 2. Use Appropriate Log Levels

```typescript
// ✅ Good - Correct level for each case
logger.info('[Roopik] User opened canvas');      // User action
logger.warn('[Roopik] API v1 deprecated');       // Warning
logger.error('[Roopik] Save failed', error);     // Error
logger.debug('[Roopik] Canvas state:', state);   // Development

// ❌ Bad - Everything is info
logger.info('[Roopik] User opened canvas');
logger.info('[Roopik] API v1 deprecated');
logger.info('[Roopik] Save failed');
```

### 3. Include Error Objects for Stack Traces

```typescript
// ✅ Good - Full stack trace in Output Panel
try {
    await saveCanvas();
} catch (error) {
    logger.error('[Roopik] Failed to save canvas', error);
}

// ❌ Bad - No stack trace
catch (error) {
    logger.error('[Roopik] Failed to save canvas');
}
```

### 4. Use console.log() for Temporary Debugging

```typescript
// Development debugging (Developer Console only)
console.log('[Roopik] Component tree:', componentTree);
console.log('[Roopik] Render time:', performance.now() - start);

// Production logging (Output Panel)
logger.info('[Roopik] Canvas rendered successfully');
```

---

## When to Use Each

| Scenario | Tool | Reason |
|----------|------|--------|
| User opened canvas | `logger.info()` | User should see this in Output Panel |
| Feature activation | `logger.info()` | User-facing milestone |
| Recoverable error | `logger.warn()` | User should be aware |
| Operation failed | `logger.error()` | User needs to know + get stack trace |
| Debugging UI state | `console.log()` | Temporary, developer-only |
| Debugging render flow | `console.log()` | Temporary, developer-only |
| Performance timing | `console.log()` | Temporary, developer-only |

---

## Automatic Log Management

VSCode automatically handles:

1. **Log File Location**: `%APPDATA%\Code\logs\<timestamp>\roopik.log`
2. **Rotation**: New session = new timestamped folder
3. **Cleanup**: Deletes logs older than 7 days
4. **Size Management**: ~10MB per file
5. **Timestamps**: Automatic formatting

**You don't need to manage any of this!**

---

## Viewing Logs

### Output Panel (User-Visible)
1. Open: `View → Output` (or `Ctrl+Shift+U`)
2. Select **"Roopik"** from dropdown
3. See all INFO, WARN, ERROR logs

### Developer Console (Development-Only)
1. Open: `Help → Toggle Developer Tools` (or `Ctrl+Shift+I`)
2. Go to **Console** tab
3. See `console.log()` statements

### Log Files (Disk)
1. Navigate to: `%APPDATA%\Code\logs\<timestamp>\roopik.log`
2. Open in text editor
3. See full history (up to 7 days)

---

## Examples

### Feature Activation
```typescript
const logger = RoopikLogger.create(loggerService);
logger.info('[Roopik] Canvas editor activated');
logger.info('[Roopik] Loaded 5 components from cache');
```

### Error Handling
```typescript
try {
    await loadProject(uri);
} catch (error) {
    logger.error('[Roopik] Failed to load project', error);
    // User sees full error + stack trace in Output Panel
}
```

### Warnings
```typescript
if (canvasVersion < 2) {
    logger.warn('[Roopik] Canvas format v1 is deprecated. Upgrade to v2.');
}
```

### Development Debugging
```typescript
// Temporary debugging (Developer Console)
console.log('[Roopik] Canvas state:', canvasState);
console.log('[Roopik] Component count:', components.length);

// Production logging (Output Panel)
logger.debug('[Roopik] Canvas state loaded');
logger.info('[Roopik] Canvas ready');
```

---

## Comparison with VSCode Services

Our logging matches VSCode's built-in services:

| Service | Pattern | Output |
|---------|---------|--------|
| **Tasks** | `loggerService.createLogger()` | Output Panel + log file |
| **MCP** | `loggerService.createLogger()` | Output Panel + log file |
| **Debug** | `loggerService.createLogger()` | Output Panel + log file |
| **Roopik** | `loggerService.createLogger()` | Output Panel + log file ✅ |

**We follow the same pattern as official VSCode services!**

---

## Implementation Details

### RoopikLogger (Simplified Factory)

```typescript
// src/vs/workbench/contrib/roopik/common/roopikLogger.ts
export class RoopikLogger {
    static readonly LOGGER_ID = 'roopik';
    static readonly LOGGER_NAME = 'Roopik';

    static create(loggerService: ILoggerService): ILogger {
        return loggerService.createLogger(RoopikLogger.LOGGER_ID, {
            name: RoopikLogger.LOGGER_NAME
        });
    }
}
```

**What it does:**
- Creates a dedicated logger for Roopik
- Automatically registers "Roopik" output channel
- Handles all file management, timestamps, formatting

---

## Architecture: Why ILoggerService?

### Old Approach (Manual Dual Logging)
```typescript
// ❌ Complex: Manual channel registration, dual writes
const outputChannelRegistry = Registry.as<IOutputChannelRegistry>(...);
outputChannelRegistry.registerChannel({ id: 'roopik' });

class RoopikLogger {
    info(message: string, showInOutputPanel: boolean): void {
        this.logService.info(message);  // Developer Console
        if (showInOutputPanel) {
            this.outputChannel.append(message);  // Manual write
        }
    }
}
```

### New Approach (ILoggerService)
```typescript
// ✅ Simple: Automatic everything
const logger = loggerService.createLogger('roopik', { name: 'Roopik' });
logger.info('[Roopik] Message');  // Automatic Output Panel + file!
```

**Benefits:**
- ✅ 95% less code
- ✅ No manual channel management
- ✅ No manual file handling
- ✅ Standard VSCode pattern
- ✅ VSCode handles everything

---

## FAQs

### Q: Why don't logs show in Developer Console?
**A:** This is **correct**! ILoggerService logs to Output Panel + files, not Developer Console. Use `console.log()` for Developer Console debugging.

### Q: Where are logs saved?
**A:** `%APPDATA%\Code\logs\<timestamp>\roopik.log`

### Q: How long are logs kept?
**A:** 7 days, then automatically deleted by VSCode

### Q: Can I see debug logs in Output Panel?
**A:** Yes! User can change log level:
1. `Developer: Set Log Level` → `Debug`
2. Now `logger.debug()` appears in Output Panel

### Q: Do I need to register the output channel?
**A:** No! `createLogger()` handles everything automatically.

### Q: When should I use console.log vs logger?
**A:**
- `logger` = Production logs (Output Panel)
- `console.log` = Development debugging (Developer Console)

---

## Migration from Old Pattern

**Old Code:**
```typescript
const logger = new RoopikLogger(logService, outputService);
logger.info('Message', true);  // Manual flag
```

**New Code:**
```typescript
const logger = RoopikLogger.create(loggerService);
logger.info('[Roopik] Message');  // Automatic!
```

---

## Summary

**Simple, production-ready logging:**

1. **Production logs** → Use `logger.info/warn/error()` → Shows in Output Panel
2. **Development logs** → Use `console.log()` → Shows in Developer Console
3. VSCode handles everything else automatically!

**That's it!** 🚀
