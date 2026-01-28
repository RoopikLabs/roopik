import { EXPERIMENT_IDS, experimentConfigsMap, experimentDefault, experiments } from "../experiments"

describe("PREVENT_FOCUS_DISRUPTION experiment", () => {
	it("should include PREVENT_FOCUS_DISRUPTION in EXPERIMENT_IDS", () => {
		expect(EXPERIMENT_IDS.PREVENT_FOCUS_DISRUPTION).toBe("preventFocusDisruption")
	})

	it("should have PREVENT_FOCUS_DISRUPTION in experimentConfigsMap", () => {
		expect(experimentConfigsMap.PREVENT_FOCUS_DISRUPTION).toBeDefined()
		expect(experimentConfigsMap.PREVENT_FOCUS_DISRUPTION.enabled).toBe(true) // Enabled by default
	})

	it("should have PREVENT_FOCUS_DISRUPTION in experimentDefault", () => {
		expect(experimentDefault.preventFocusDisruption).toBe(true) // Enabled by default
	})

	it("should correctly check if PREVENT_FOCUS_DISRUPTION is enabled", () => {
		// Test when experiment is explicitly disabled
		const disabledConfig = { preventFocusDisruption: false }
		expect(experiments.isEnabled(disabledConfig, EXPERIMENT_IDS.PREVENT_FOCUS_DISRUPTION)).toBe(false)

		// Test when experiment is enabled
		const enabledConfig = { preventFocusDisruption: true }
		expect(experiments.isEnabled(enabledConfig, EXPERIMENT_IDS.PREVENT_FOCUS_DISRUPTION)).toBe(true)

		// Test when experiment is not in config (should use default = true)
		const emptyConfig = {}
		expect(experiments.isEnabled(emptyConfig, EXPERIMENT_IDS.PREVENT_FOCUS_DISRUPTION)).toBe(true)
	})
})
