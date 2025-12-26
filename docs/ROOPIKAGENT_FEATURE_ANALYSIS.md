# RoopikAgent Feature Analysis: Keep vs Remove

**Analysis of Roo Code features to determine what's proprietary vs what benefits our users**

---

## Feature Breakdown

### 1. **Marketplace** 🎯 **KEEP - This is GREAT for users!**

**What it does**:
- Fetches curated list of **MCP servers** from Roo's API (`api.roocode.com/api/marketplace/mcps`)
- Fetches pre-configured **agent modes** (prompts/rules) from Roo's API
- Provides **one-click installation** of MCP servers
- Provides **one-click installation** of custom agent modes

**How it works** (analyzed from code):
```typescript
// RemoteConfigLoader.ts - Fetches from Roo's API
async loadAllItems() {
  const modes = await fetch(`${rooApiUrl}/api/marketplace/modes`);  // Agent modes (prompts)
  const mcps = await fetch(`${rooApiUrl}/api/marketplace/mcps`);    // MCP servers
  return [...modes, ...mcps];
}
```

**Data flow**:
```
User clicks "Marketplace"
  → Fetches from api.roocode.com/api/marketplace/mcps (public endpoint)
  → Shows list of MCP servers (e.g., @modelcontextprotocol/server-filesystem)
  → User clicks "Install"
  → Downloads MCP server config
  → Adds to user's MCP settings
  → NO data sent to Roo about user ✅
```

**Examples of marketplace items**:
- MCP Servers: `@modelcontextprotocol/server-filesystem`, `@modelcontextprotocol/server-github`, etc.
- Agent Modes: "React Expert", "Python Tutor", "DevOps Engineer" (custom prompts/rules)

**Privacy Analysis**:
- ✅ **SAFE**: Only reads from Roo's API (public endpoint)
- ✅ **NO user data sent**: Installation is local, no telemetry
- ✅ **User benefit**: Easy MCP discovery vs manually finding/configuring
- ✅ **Can work offline**: Marketplace caches for 5 minutes, gracefully degrades

**Recommendation**: **KEEP** - This is genuinely useful for users. It's like VSCode's extension marketplace but for MCP servers.

---

### 2. **Cloud Button** ❌ **REMOVE - Proprietary Roo account system**

**What it does**:
- Login to Roo Code account (OAuth with `auth.roocode.com`)
- Syncs settings to Roo's cloud
- Organization management (team accounts)
- Billing/subscription

**How it works**:
```typescript
// CloudService.ts
class CloudService {
  async login() {
    // OAuth flow with auth.roocode.com
    // Stores JWT token
    // Sends user data to Roo servers
  }

  async syncSettings() {
    // Uploads user's settings to Roo cloud
    // Syncs API keys, preferences, etc.
  }
}
```

**Privacy Analysis**:
- ❌ **PROPRIETARY**: Requires Roo account (user signs up with Roo)
- ❌ **Sends user data**: Settings, API keys potentially uploaded to Roo servers
- ❌ **Billing tied to Roo**: Subscription/organization features

**Recommendation**: **REMOVE** - This is Roo's proprietary account system. We don't want our users' data going to Roo.

---

### 3. **Cloud Sync** ❌ **REMOVE - Sends user data to Roo**

**What it does**:
- Syncs extension settings across devices via Roo's cloud
- **NOT GitHub-based** - Uses Roo's proprietary servers

**How it works**:
```typescript
// SettingsService.ts (inside @roo-code/cloud package)
async syncSettings(settings: UserSettings) {
  // Sends to Roo's cloud API
  await fetch('https://api.roocode.com/api/settings', {
    method: 'POST',
    body: JSON.stringify(settings),
    headers: { Authorization: `Bearer ${userToken}` }
  });
}
```

**Data sent to Roo**:
- User preferences
- API keys (potentially)
- Custom prompts/rules
- Usage patterns

**Privacy Analysis**:
- ❌ **PROPRIETARY**: Uses Roo's servers
- ❌ **Sends sensitive data**: Settings could include API keys
- ❌ **NOT GitHub**: Not using VSCode's built-in Settings Sync

**Recommendation**: **REMOVE** - We don't want user data sent to Roo. If users want sync, they can use VSCode's built-in Settings Sync (GitHub-based).

---

### 4. **Organization MCP Allowlist** 🤔 **PARTIAL - Keep marketplace, remove org control**

**What it does**:
- Organizations can **enforce** which MCP servers employees can use
- Allows companies to restrict marketplace items
- Adds organization-specific MCP servers to marketplace

**How it works**:
```typescript
// MarketplaceManager.ts
async getMarketplaceItems() {
  let orgSettings = CloudService.instance.getOrganizationSettings(); // From Roo account

  if (orgSettings) {
    // Show org's custom MCPs
    organizationMcps = orgSettings.mcps;

    // Hide MCPs blacklisted by org
    marketplaceItems = allItems.filter(item =>
      !orgSettings.hiddenMcps.includes(item.id)
    );
  }
}
```

**Use case**:
- Company "Acme Corp" has Roo organization account
- Acme wants employees to only use approved MCP servers
- Acme adds custom internal MCP to organization marketplace

**Privacy Analysis**:
- ⚠️ **Tied to Cloud**: Requires Roo organization account
- ✅ **BUT**: Marketplace itself works without org (public endpoint)

**Recommendation**: **Keep marketplace (public), remove org control**
- ✅ Keep: Public marketplace fetching (benefits all users)
- ❌ Remove: Organization settings (requires Roo account)

---

### 5. **Telemetry** ❌ **REMOVE - Sends usage data to Roo**

**What it does**:
- Tracks user actions (PostHog analytics)
- Sends to Roo's telemetry service

**How it works**:
```typescript
// @roo-code/telemetry package
import { PostHog } from 'posthog-node';

telemetry.track('task_started', {
  model: 'claude-sonnet-4.5',
  userId: 'hash-of-user-id'
});
```

**Data sent to Roo**:
- Feature usage
- Error reports
- Model selections
- Task metrics

**Recommendation**: **REMOVE** - We don't need to send user data to Roo.

---

## Summary: What to Keep vs Remove

### ✅ **KEEP (Benefits users, no privacy issues)**

| Feature | Why Keep | Privacy Safe? |
|---------|----------|---------------|
| **Marketplace (public MCP list)** | Easy MCP discovery, one-click install | ✅ Read-only from public API |
| **MCP installation** | Simplifies MCP setup | ✅ Local installation only |
| **Agent modes** | Pre-configured prompts/rules | ✅ Downloaded, no tracking |

### ❌ **REMOVE (Proprietary Roo features)**

| Feature | Why Remove | Privacy Issue? |
|---------|------------|----------------|
| **Cloud Button** | Roo account login | ❌ User signs up with Roo |
| **Cloud Sync** | Settings sync via Roo servers | ❌ Sends user data to Roo |
| **Organization features** | Team management via Roo | ❌ Requires Roo account |
| **Telemetry** | Usage tracking | ❌ Sends analytics to Roo |
| **Billing/Subscription** | Roo's payment system | ❌ Proprietary |

### 🔧 **MODIFY (Keep functionality, remove cloud dependency)**

| Feature | Keep | Remove | How |
|---------|------|--------|-----|
| **Marketplace** | ✅ Public MCP list | ❌ Org MCP allowlist | Fetch public endpoint only, ignore CloudService |
| **MCP installation** | ✅ Local install logic | ❌ Cloud-based org enforcement | Remove org checks, install directly |

---

## Implementation Plan

### Step 1: Keep Marketplace (Remove Cloud Dependency)

**Before** (requires CloudService):
```typescript
// MarketplaceManager.ts
async getMarketplaceItems() {
  let orgSettings: OrganizationSettings | undefined;

  if (CloudService.hasInstance() && CloudService.instance.isAuthenticated()) {
    orgSettings = CloudService.instance.getOrganizationSettings(); // ❌ Remove this
  }

  const allMarketplaceItems = await this.configLoader.loadAllItems(orgSettings?.hideMarketplaceMcps);

  // Apply org filtering ❌ Remove this
  if (orgSettings) {
    organizationMcps = orgSettings.mcps;
    marketplaceItems = filterByOrgRules(allMarketplaceItems, orgSettings);
  }

  return { organizationMcps, marketplaceItems };
}
```

**After** (cloud-free):
```typescript
// MarketplaceManager.ts
async getMarketplaceItems() {
  // Just load public marketplace items
  const marketplaceItems = await this.configLoader.loadAllItems();

  return { marketplaceItems }; // No org items
}
```

### Step 2: Remove CloudService Import

```typescript
// Before
import { CloudService } from "@roo-code/cloud"; // ❌ Remove

// After
// No cloud import needed
```

### Step 3: Keep RemoteConfigLoader (Public API Only)

```typescript
// RemoteConfigLoader.ts - This is SAFE to keep
export class RemoteConfigLoader {
  constructor() {
    this.apiBaseUrl = 'https://api.roocode.com'; // Public endpoint, read-only
  }

  async loadAllItems(): Promise<MarketplaceItem[]> {
    // Fetches public MCP list (no auth, no user tracking)
    const mcps = await axios.get(`${this.apiBaseUrl}/api/marketplace/mcps`);
    const modes = await axios.get(`${this.apiBaseUrl}/api/marketplace/modes`);

    return [...mcps.data.items, ...modes.data.items];
  }
}
```

**Privacy check**: ✅ **SAFE**
- No auth tokens sent
- No user data sent
- Read-only public endpoint
- Same as fetching from npm registry or VSCode marketplace

### Step 4: Remove Cloud Button from UI

```typescript
// package.json - Remove cloud command
{
  "commands": [
    // ❌ Remove this
    {
      "command": "roo-cline.cloudButtonClicked",
      "title": "Cloud",
      "icon": "$(cloud)"
    }
  ]
}
```

```tsx
// webview/Toolbar.tsx - Remove cloud button
<Toolbar>
  <NewChatButton />
  <SettingsButton />
  {/* ❌ Remove: <CloudButton /> */}
  <MarketplaceButton /> {/* ✅ Keep */}
</Toolbar>
```

---

## Final Recommendation

### **Phase 3 Updated: Strip Cloud, Keep Marketplace**

**Remove**:
- ❌ `packages/cloud/` package
- ❌ `packages/telemetry/` package
- ❌ Cloud button UI
- ❌ CloudService imports
- ❌ Organization features
- ❌ Settings sync

**Keep**:
- ✅ Marketplace UI (MCP discovery)
- ✅ RemoteConfigLoader (public API only)
- ✅ MarketplaceManager (install logic)
- ✅ SimpleInstaller (local MCP installation)

**Modify**:
- 🔧 Remove CloudService dependency from MarketplaceManager
- 🔧 Remove org filtering logic
- 🔧 Fetch only public marketplace items

**Result**:
- ✅ Users get easy MCP discovery (like VSCode marketplace)
- ✅ Zero user data sent to Roo
- ✅ Works offline (5min cache)
- ✅ No Roo account required
- ✅ No telemetry

---

## Privacy Guarantee

**After cleanup**:
1. ✅ No user login/signup
2. ✅ No settings sent to Roo servers
3. ✅ No telemetry tracking
4. ✅ Only read-only fetches from public marketplace API
5. ✅ All MCP installations are local
6. ✅ No data about our users goes to Roo

**What we're using from Roo**:
- Public marketplace catalog (read-only, no tracking)
- Same as how VSCode uses Microsoft's extension marketplace

**What we're NOT using**:
- Roo accounts
- Roo cloud sync
- Roo telemetry
- Roo billing
- Roo organizations

---

## Questions Answered

> **Q: "is this cloud sysn wiht ro cloud server or github any suers can use?"**

**A**: Cloud sync uses **Roo's proprietary servers**, NOT GitHub.
- ❌ Remove it
- ✅ Users can use VSCode's built-in Settings Sync (GitHub-based) instead

---

> **Q: "if something is propertirty that sensd datat to ro about our users we don't want that!"**

**A**: Correct! Here's what sends data to Roo:
- ❌ CloudService (login, settings sync) - **REMOVE**
- ❌ Telemetry (PostHog tracking) - **REMOVE**
- ✅ Marketplace (read-only public API) - **KEEP** (no user data sent)

---

> **Q: "marketplace is something good we can give to our users to use!"**

**A**: Absolutely! Marketplace is **genuinely useful** and **privacy-safe**:
- ✅ No login required
- ✅ No user tracking
- ✅ Just fetches public MCP catalog
- ✅ Like VSCode extension marketplace
- ✅ Makes MCP discovery easy

**We'll keep marketplace, just remove the cloud/org features.**

---

## Next Steps

Ready to proceed with updated Phase 3:
1. **Keep**: Marketplace (public MCP list)
2. **Remove**: Cloud, telemetry, org features
3. **Test**: Marketplace works without CloudService

Shall we start Phase 1 (restructure extension)?
