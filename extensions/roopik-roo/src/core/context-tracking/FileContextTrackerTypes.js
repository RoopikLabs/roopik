import { z } from "zod";
// Zod schema for RecordSource
export const recordSourceSchema = z.enum(["read_tool", "user_edited", "roo_edited", "file_mentioned"]);
// Zod schema for FileMetadataEntry
export const fileMetadataEntrySchema = z.object({
    path: z.string(),
    record_state: z.enum(["active", "stale"]),
    record_source: recordSourceSchema,
    roo_read_date: z.number().nullable(),
    roo_edit_date: z.number().nullable(),
    user_edit_date: z.number().nullable().optional(),
});
// Zod schema for TaskMetadata
export const taskMetadataSchema = z.object({
    files_in_context: z.array(fileMetadataEntrySchema),
});
//# sourceMappingURL=FileContextTrackerTypes.js.map