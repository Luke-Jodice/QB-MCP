import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createQuickbaseClient,
  handleApiError,
  truncateIfNeeded,
  formatRecordsAsMarkdown,
  QuickbaseConfig,
  QuickbaseQueryResponse,
  QuickbaseUpsertResponse,
} from "../services/quickbase.js";

export function registerRecordTools(server: McpServer, config: QuickbaseConfig): void {
  const client = createQuickbaseClient(config);

  // ─── Query Records ──────────────────────────────────────────────
  server.registerTool(
    "quickbase_query_records",
    {
      title: "Query Records",
      description: `Query records from a Quickbase table with optional filtering, sorting, and pagination.

Uses Quickbase's query syntax where conditions follow the format: {fieldId.operator.value}
Common operators: EX (equals), CT (contains), GT (greater than), LT (less than), GTE, LTE, BEF (date before), AF (date after)
Combine with AND/OR: {6.EX.'Active'} AND {7.CT.'John'}

Args:
  - tableId (string): The Quickbase table ID (e.g. "bsf8tqhe6")
  - where (string, optional): Query filter string. Leave blank to get all records.
  - select (number[], optional): Field IDs to return. Leave blank for all fields.
  - sortBy (object[], optional): Array of {fieldId, order} for sorting. order: "ASC" | "DESC"
  - skip (number, optional): Number of records to skip for pagination (default: 0)
  - top (number, optional): Max records to return (default: 100, max: 10000)
  - response_format (string): "markdown" or "json" (default: "markdown")

Returns:
  Matching records with field labels and metadata (total count, pagination info).

Examples:
  - All records: leave where empty, set top: 50
  - Filter active users: where = "{8.EX.'Active'}"
  - Date range: where = "{10.AF.'2024-01-01'} AND {10.BEF.'2024-12-31'}"`,
      inputSchema: z.object({
        tableId: z.string().min(1).describe("Quickbase table ID (e.g. 'bsf8tqhe6')"),
        where: z.string().optional().describe("Query filter, e.g. '{6.EX.\"Active\"}'"),
        select: z.array(z.number().int().positive()).optional().describe("Field IDs to return"),
        sortBy: z.array(z.object({
          fieldId: z.number().int().positive(),
          order: z.enum(["ASC", "DESC"]).default("ASC"),
        })).optional().describe("Sort order"),
        skip: z.number().int().min(0).default(0).describe("Records to skip for pagination"),
        top: z.number().int().min(1).max(10000).default(100).describe("Max records to return"),
        response_format: z.enum(["markdown", "json"]).default("markdown"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ tableId, where, select, sortBy, skip, top, response_format }) => {
      try {
        const body: Record<string, unknown> = { from: tableId, options: { skip, top } };
        if (where) body.where = where;
        if (select?.length) body.select = select;
        if (sortBy?.length) body.sortBy = sortBy.map((s) => ({ fieldId: s.fieldId, order: s.order }));

        const { data } = await client.post<QuickbaseQueryResponse>("/records/query", body);
        const records = data.data ?? [];
        const fields = data.fields ?? [];
        const meta = data.metadata;

        if (response_format === "json") {
          const output = { totalRecords: meta.totalRecords, returned: meta.numRecords, skip: meta.skip, records, fields };
          return { content: [{ type: "text", text: truncateIfNeeded(JSON.stringify(output, null, 2)) }] };
        }

        const table = formatRecordsAsMarkdown(records, fields);
        const summary = `**Table:** \`${tableId}\` | **Total:** ${meta.totalRecords} records | **Showing:** ${meta.numRecords} (skip: ${meta.skip})\n\n${table}`;
        return { content: [{ type: "text", text: truncateIfNeeded(summary) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${handleApiError(err)}` }], isError: true };
      }
    }
  );

  // ─── Get Record by ID ────────────────────────────────────────────
  server.registerTool(
    "quickbase_get_record",
    {
      title: "Get Record by ID",
      description: `Retrieve a single record by its Record ID from a Quickbase table.

Args:
  - tableId (string): The Quickbase table ID
  - recordId (number): The record's unique ID (field 3 is always the Record ID)
  - select (number[], optional): Specific field IDs to return

Returns:
  The record's field values with labels. Returns error if the record does not exist.`,
      inputSchema: z.object({
        tableId: z.string().min(1).describe("Quickbase table ID"),
        recordId: z.number().int().positive().describe("Record ID number"),
        select: z.array(z.number().int().positive()).optional().describe("Field IDs to return"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ tableId, recordId, select }) => {
      try {
        const body: Record<string, unknown> = {
          from: tableId,
          where: `{3.EX.${recordId}}`,
        };
        if (select?.length) body.select = select;

        const { data } = await client.post<QuickbaseQueryResponse>("/records/query", body);
        const records = data.data ?? [];

        if (records.length === 0) {
          return { content: [{ type: "text", text: `No record found with ID ${recordId} in table ${tableId}.` }] };
        }

        const fields = data.fields ?? [];
        const record = records[0];
        const lines = fields.map((f) => {
          const val = record[String(f.id)]?.value;
          return `**${f.label}** (field ${f.id}): ${val === null || val === undefined ? "_empty_" : typeof val === "object" ? JSON.stringify(val) : String(val)}`;
        });

        return { content: [{ type: "text", text: `**Record ${recordId} in \`${tableId}\`**\n\n${lines.join("\n")}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${handleApiError(err)}` }], isError: true };
      }
    }
  );

  // ─── Upsert Records ──────────────────────────────────────────────
  server.registerTool(
    "quickbase_upsert_records",
    {
      title: "Create or Update Records",
      description: `Insert new records or update existing records in a Quickbase table (upsert).

To CREATE a new record: omit the Record ID field (field 3) from the data.
To UPDATE an existing record: include field 3 with the record's ID.
To use a custom merge field: specify mergeFieldId to match on that field instead.

Args:
  - tableId (string): Target Quickbase table ID
  - data (object[]): Array of records. Each record is { fieldId: value } pairs.
      Example: [{ "6": "Active", "7": "John Smith", "8": 42 }]
  - mergeFieldId (number, optional): Field ID to use as upsert key (instead of Record ID)
  - fieldsToReturn (number[], optional): Field IDs to include in the response

Returns:
  Summary of created, updated, and unchanged record IDs.

Examples:
  - Create: data = [{ "6": "New Value", "7": "Another Value" }]
  - Update record 5: data = [{ "3": 5, "6": "Updated Value" }]`,
      inputSchema: z.object({
        tableId: z.string().min(1).describe("Target table ID"),
        data: z.array(z.record(z.string(), z.unknown())).min(1).describe("Array of records as {fieldId: value} objects"),
        mergeFieldId: z.number().int().positive().optional().describe("Field ID to match on for upsert (default: Record ID)"),
        fieldsToReturn: z.array(z.number().int().positive()).optional().describe("Field IDs to return in response"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ tableId, data, mergeFieldId, fieldsToReturn }) => {
      try {
        // Transform data: wrap values in { value: ... } as required by Quickbase API
        const transformedData = data.map((record) => {
          const transformed: Record<string, { value: unknown }> = {};
          for (const [fieldId, value] of Object.entries(record)) {
            transformed[fieldId] = { value };
          }
          return transformed;
        });

        const body: Record<string, unknown> = { to: tableId, data: transformedData };
        if (mergeFieldId) body.mergeFieldId = mergeFieldId;
        if (fieldsToReturn?.length) body.fieldsToReturn = fieldsToReturn;

        const { data: result } = await client.post<QuickbaseUpsertResponse>("/records", body);
        const meta = result.metadata;

        const summary = [
          `**Upsert complete for table \`${tableId}\`**`,
          `- ✅ Created: ${meta.createdRecordIds.length} records (IDs: ${meta.createdRecordIds.join(", ") || "none"})`,
          `- 🔄 Updated: ${meta.updatedRecordIds.length} records (IDs: ${meta.updatedRecordIds.join(", ") || "none"})`,
          `- ⏭️  Unchanged: ${meta.unchangedRecordIds.length} records`,
          `- 📊 Total processed: ${meta.totalNumberOfRecordsProcessed}`,
        ].join("\n");

        return { content: [{ type: "text", text: summary }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${handleApiError(err)}` }], isError: true };
      }
    }
  );

  // ─── Delete Records ──────────────────────────────────────────────
  server.registerTool(
    "quickbase_delete_records",
    {
      title: "Delete Records",
      description: `Delete records from a Quickbase table matching a query condition. This operation is irreversible.

Uses Quickbase query syntax for the where clause.
CAUTION: If you want to delete all records, use where = "{'3'.GT.'0'}" (all record IDs greater than 0).

Args:
  - tableId (string): Table ID containing the records to delete
  - where (string): Required filter query. Records matching this will be deleted.
      Example: "{3.EX.42}" deletes record with ID 42
      Example: "{6.EX.'Inactive'}" deletes all records where field 6 equals "Inactive"

Returns:
  Number of records deleted.`,
      inputSchema: z.object({
        tableId: z.string().min(1).describe("Table ID"),
        where: z.string().min(1).describe("Query to select records for deletion, e.g. '{3.EX.42}'"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ tableId, where }) => {
      try {
        const { data } = await client.delete<{ numberDeleted: number }>("/records", {
          data: { from: tableId, where },
        });
        return { content: [{ type: "text", text: `✅ Deleted **${data.numberDeleted}** record(s) from table \`${tableId}\`.` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${handleApiError(err)}` }], isError: true };
      }
    }
  );
}
