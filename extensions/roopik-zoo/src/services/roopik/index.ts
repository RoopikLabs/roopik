/**
 * Roopik Services
 *
 * Services for communicating with Roopik IDE core.
 * Provides typed access to all Roopik tools from roopik-roo.
 */

export {
	RoopikToolClient,
	roopikClient,
	type RoopikToolResult,
	type ScreenshotData,
	type NavigateData,
	type ReloadData,
	type ExecuteScriptData,
	type InspectElementData,
	type ErrorsData,
	type ConsoleLogsData,
	type ActiveProjectData,
	type StartProjectData,
	type StopProjectData,
	type CanvasSummary,
	type ListCanvasesData,
	type ActiveCanvasData,
	type CreateCanvasData,
	type ComponentSummary,
	type AddComponentData,
	type AddComponentsData,
	type RemoveComponentData,
	type GetComponentInfoData,
	type ListComponentsData,
	type RebuildComponentData,
} from "./RoopikToolClient"
