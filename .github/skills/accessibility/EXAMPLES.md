# Accessibility Help Dialog — Advanced Pattern

When the provider needs injected services or must track state (e.g., storing a reference to the previously focused element), create a custom class that extends `Disposable` and implements `IAccessibleViewContentProvider`, then instantiate it via `IInstantiationService` (see `CommentsAccessibilityHelpProvider` for an example):

```ts
class MyFeatureAccessibilityHelpProvider extends Disposable implements IAccessibleViewContentProvider {
	readonly id = AccessibleViewProviderId.MyFeature;
	readonly verbositySettingKey = AccessibilityVerbositySettingId.MyFeature;
	readonly options: IAccessibleViewOptions = { type: AccessibleViewType.Help };

	provideContent(): string { /* … */ }
	onClose(): void { /* … */ }
}

// In getProvider():
getProvider(accessor: ServicesAccessor) {
	return accessor.get(IInstantiationService).createInstance(MyFeatureAccessibilityHelpProvider);
}
```
