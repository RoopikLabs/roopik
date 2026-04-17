---
name: accessibility
description: "Accessibility guidelines for VS Code features — covers accessibility help dialogs, accessible views, verbosity settings, accessibility signals, ARIA alerts/status announcements, keyboard navigation, and ARIA labels/roles. Use when creating or updating UI features that need accessibility support, or when the user mentions accessibility, ARIA, screen readers, or keyboard navigation in VS Code."
---

When adding a **new interactive UI surface** to VS Code — a panel, view, widget, editor overlay, dialog, or any rich focusable component the user interacts with — you **must** provide three accessibility components (if they do not already exist for the feature):

1. **An Accessibility Help Dialog** — opened via the accessibility help keybinding when the feature has focus.
2. **An Accessible View** — a plain-text read-only editor that presents the feature's content to screen reader users (when the feature displays non-trivial visual content).
3. **An Accessibility Verbosity Setting** — a boolean setting that controls whether the "open accessibility help" hint is announced.

Examples of existing features that have all three: the **terminal**, **chat panel**, **notebook**, **diff editor**, **inline completions**, **comments**, **debug REPL**, **hover**, and **notifications**. Features with only a help dialog (no accessible view) include **find widgets**, **source control input**, **keybindings editor**, **problems panel**, and **walkthroughs**.

Sections 4–7 below (signals, ARIA announcements, keyboard navigation, ARIA labels) apply more broadly to **any UI change**, including modifications to existing features.

When **updating an existing feature** — for example, adding new commands, keyboard shortcuts, or interactive capabilities — you must also update the feature's existing accessibility help dialog (`provideContent()`) to document the new functionality. Screen reader users rely on the help dialog as the primary way to discover available actions.

---

## 1. Accessibility Help Dialog

An accessibility help dialog tells the user what the feature does, which keyboard shortcuts are available, and how to interact with it via a screen reader.

### Steps

1. **Create a class implementing `IAccessibleViewImplementation`** with `type = AccessibleViewType.Help`.
   - Set a `priority` (higher = shown first when multiple providers match).
   - Set `when` to a `ContextKeyExpression` that matches when the feature is focused.
   - `getProvider(accessor)` returns an `AccessibleContentProvider`.

2. **Create a content-provider class** implementing `IAccessibleViewContentProvider`.
   - `id` — add a new entry in the `AccessibleViewProviderId` enum in `src/vs/platform/accessibility/browser/accessibleView.ts`.
   - `verbositySettingKey` — reference the new `AccessibilityVerbositySettingId` entry (see §3).
   - `options` — `{ type: AccessibleViewType.Help }`.
   - `provideContent()` — return localized, multi-line help text.

3. **Implement `onClose()`** to restore focus to whatever element was focused before the help dialog opened. This ensures keyboard users and screen reader users return to their previous context.

4. **Register** the implementation:
   ```ts
   AccessibleViewRegistry.register(new MyFeatureAccessibilityHelp());
   ```
   in the feature's `*.contribution.ts` file.

### Example skeleton

The simplest approach is to return an `AccessibleContentProvider` directly from `getProvider()`. This is the most common pattern in the codebase (used by chat, inline chat, quick chat, etc.):

```ts
import { AccessibleViewType, AccessibleContentProvider, AccessibleViewProviderId } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { AccessibilityVerbositySettingId } from '../../../../platform/accessibility/common/accessibilityConfiguration.js';

export class MyFeatureAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 100;
	readonly name = 'my-feature';
	readonly type = AccessibleViewType.Help;
	readonly when = MyFeatureContextKeys.isFocused;

	getProvider(accessor: ServicesAccessor) {
		const helpText = [
			localize('myFeature.help.overview', "You are in My Feature. …"),
			localize('myFeature.help.key1', "- {0}: Do something", '<keybinding:myFeature.doSomething>'),
		].join('\n');
		return new AccessibleContentProvider(
			AccessibleViewProviderId.MyFeature,
			{ type: AccessibleViewType.Help },
			() => helpText,
			() => { /* onClose — refocus whatever was focused before */ },
			AccessibilityVerbositySettingId.MyFeature,
		);
	}
}
```

For an advanced pattern using injected services and `IInstantiationService`, see [EXAMPLES.md](EXAMPLES.md) (modeled on `CommentsAccessibilityHelpProvider`).

---

## 2. Accessible View

An accessible view presents the feature's visual content as plain text in a read-only editor. It is required when the feature renders rich or visual content that a screen reader cannot directly read (for example: chat responses, hover tooltips, notifications, terminal output, inline completions).

If the feature is purely keyboard-driven with native text input/output (e.g., a simple input field), an accessible view is not needed — only an accessibility help dialog is required.

### Steps

1. **Create a class implementing `IAccessibleViewImplementation`** with `type = AccessibleViewType.View`.
2. **Create a content-provider** similar to the help dialog, but:
   - `options` — `{ type: AccessibleViewType.View }`, optionally with a `language` for syntax highlighting.
   - `provideContent()` — return the feature's current content as plain text.
   - Optionally implement `provideNextContent()` / `providePreviousContent()` for item-by-item navigation.
   - Implement `onClose()` to restore focus to whatever was focused before the accessible view was opened.
   - Optionally provide `actions` for actions the user can take from the accessible view.
3. **Register** alongside the help dialog:
   ```ts
   AccessibleViewRegistry.register(new MyFeatureAccessibleView());
   ```

### Example skeleton

```ts
export class MyFeatureAccessibleView implements IAccessibleViewImplementation {
	readonly priority = 100;
	readonly name = 'my-feature';
	readonly type = AccessibleViewType.View;
	readonly when = MyFeatureContextKeys.isFocused;

	getProvider(accessor: ServicesAccessor) {
		// Retrieve services, build content from the feature's current state
		const content = getMyFeatureContent();
		if (!content) {
			return undefined;
		}
		return new AccessibleContentProvider(
			AccessibleViewProviderId.MyFeature,
			{ type: AccessibleViewType.View },
			() => content,
			() => { /* onClose — refocus whatever was focused before the accessible view opened */ },
			AccessibilityVerbositySettingId.MyFeature,
		);
	}
}
```

---

## 3. Accessibility Verbosity Setting

A verbosity setting controls whether a hint such as "press Alt+F1 for accessibility help" is announced when the feature gains focus. Users who already know the shortcut can disable it.

### Steps

1. **Add an entry** to `AccessibilityVerbositySettingId` in
   `src/vs/workbench/contrib/accessibility/browser/accessibilityConfiguration.ts`:
   ```ts
   export const enum AccessibilityVerbositySettingId {
       // … existing entries …
       MyFeature = 'accessibility.verbosity.myFeature'
   }
   ```

2. **Register the configuration property** in the same file's `configuration.properties` object:
   ```ts
   [AccessibilityVerbositySettingId.MyFeature]: {
       description: localize('verbosity.myFeature.description',
           'Provide information about how to access the My Feature accessibility help menu when My Feature is focused.'),
       ...baseVerbosityProperty
   },
   ```
   The `baseVerbosityProperty` gives it `type: 'boolean'`, `default: true`, and `tags: ['accessibility']`.

3. **Reference the setting key** in both the help-dialog provider (`verbositySettingKey`) and the accessible-view provider so the runtime can check whether to show the hint.

---

## 4. Accessibility Signals (Sounds & Announcements)

Accessibility signals provide audible and spoken feedback for events that happen visually. Use `IAccessibilitySignalService` to play signals when something important occurs (e.g., an error appears, a task completes, content changes).

### When to use

- **Use an existing signal** when the event already has one defined (see `AccessibilitySignal.*` static members — e.g., `AccessibilitySignal.error`, `AccessibilitySignal.terminalQuickFix`, `AccessibilitySignal.clear`).
- **If no existing signal fits**, reach out to @meganrogge to discuss adding a new one. Do not register new signals without coordinating first.

### How signals work

Each signal has two modalities controlled by user settings:
- **Sound** — a short audio cue, configurable to `auto` (on when screen reader attached), `on`, or `off`.
- **Announcement** — a spoken message via `aria-live`, configurable to `auto` or `off`.

### Usage

```ts
// Inject the service via constructor parameter
constructor(
	@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService
) { }

// Play a signal
this._accessibilitySignalService.playSignal(AccessibilitySignal.terminalQuickFix);

// Play with options
this._accessibilitySignalService.playSignal(AccessibilitySignal.error, { userGesture: true });
```

---

## 5. ARIA Alerts vs. Status Messages

Use the `alert()` and `status()` functions from `src/vs/base/browser/ui/aria/aria.ts` to announce dynamic changes to screen readers.

### Guidelines

- **`alert(msg)`** for urgent information (errors, user-initiated action results). **`status(msg)`** for non-urgent updates (progress, counts).
- **Prefer `status()` over `alert()`** — overusing `alert()` creates a noisy experience.
- **Do not duplicate** — if an accessibility signal already announces the event, skip `alert()`/`status()`.
- **Localize** all messages with `nls.localize()`.

---

## 6. Keyboard Navigation & ARIA

VS Code-specific notes beyond standard WAI-ARIA patterns:

- **Focus visibility**: Use VS Code's theme `focusBorder` for focus indicators.
- **Localize all `aria-label` values** with `nls.localize()`. Describe the action: "Close panel", "Toggle sidebar", "Run task".
- **`aria-setsize` / `aria-posinset`**: Required on virtualized lists and trees so screen readers report correct counts.
- **`aria-hidden="true"`**: Apply to decorative elements (icons next to text labels, separators).
- Test with VoiceOver (macOS) or NVDA (Windows).

---

## Checklist for Every New Feature

- [ ] New `AccessibleViewProviderId` entry added in `accessibleView.ts`
- [ ] New `AccessibilityVerbositySettingId` entry added in `accessibilityConfiguration.ts`
- [ ] Verbosity setting registered in the configuration properties with `...baseVerbosityProperty`
- [ ] `IAccessibleViewImplementation` with `type = Help` created and registered
- [ ] Content provider references the correct `verbositySettingKey`
- [ ] Help text is fully localized using `nls.localize()`
- [ ] Keybindings in help text use `<keybinding:commandId>` syntax for dynamic resolution
- [ ] `when` context key is set so the dialog only appears when the feature is focused
- [ ] If the feature has rich/visual content: `IAccessibleViewImplementation` with `type = View` created and registered
- [ ] Registration calls in the feature's `*.contribution.ts` file
- [ ] Accessibility signal played for important events (use existing `AccessibilitySignal.*` or register a new one)
- [ ] `aria.alert()` or `aria.status()` used appropriately for dynamic changes (prefer `status()` unless urgent)
- [ ] All interactive elements reachable and operable via keyboard
- [ ] All interactive elements without visible text have a localized `aria-label`
- [ ] Custom widgets declare the correct ARIA `role` and state attributes
- [ ] Decorative elements are hidden with `aria-hidden="true"`

## Key Files

- `src/vs/platform/accessibility/browser/accessibleView.ts` — `AccessibleViewProviderId`, `AccessibleContentProvider`, `IAccessibleViewContentProvider`
- `src/vs/platform/accessibility/browser/accessibleViewRegistry.ts` — `AccessibleViewRegistry`, `IAccessibleViewImplementation`
- `src/vs/workbench/contrib/accessibility/browser/accessibilityConfiguration.ts` — `AccessibilityVerbositySettingId`, verbosity setting registration
- `src/vs/platform/accessibilitySignal/browser/accessibilitySignalService.ts` — `IAccessibilitySignalService`, `AccessibilitySignal`
- `src/vs/base/browser/ui/aria/aria.ts` — `alert()`, `status()` for ARIA live region announcements

