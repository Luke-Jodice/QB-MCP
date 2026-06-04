import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createQuickbaseClient,
  handleApiError,
  truncateIfNeeded,
  formatRecordsAsMarkdown,
  QuickbaseConfig,
  QuickbaseQueryResponse,
} from "../services/quickbase.js";

interface QuickbaseReport {
  id: string;
  name: string;
  type: string;
  description?: string;
  ownerId?: string;
}

interface QuickbaseReportRunResult {
  data: Array<Record<string, { value: unknown }>>;
  fields: Array<{ id: number; label: string; type: string }>;
  metadata: {
    totalRecords: number;
    numRecords: number;
    numFields: number;
    skip: number;
  };
}

interface QuickbaseFieldCreate {
  id: number;
  label: string;
  fieldType: string;
}

export function registerReportAndFieldTools(server: McpServer, config: QuickbaseConfig): void {
  const client = createQuickbaseClient(config);

  // ─── List Reports ─────────────────────────────────────────────────
  server.registerTool(
    "quickbase_list_reports",
    {
      title: "List Reports in Table",
      description: `List all saved reports for a Quickbase table.

Args:
  - tableId (string): The Quickbase table ID

Returns:
  Report IDs, names, types, and descriptions. Use report IDs to run them.

Report types include: table, summary, chart, calendar, timeline, map`,
      inputSchema: z.object({
        tableId: z.string().min(1).describe("Quickbase table ID"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ tableId }) => {
      try {
        const { data } = await client.get<QuickbaseReport[]>(`/reports?tableId=${tableId}`);
        if (!data?.length) {
          return { content: [{ type: "text", text: `No reports found in table \`${tableId}\`.` }] };
        }

        const lines = [
          `**Reports in Table \`${tableId}\`** (${data.length} reports)\n`,
          "| ID | Name | Type |",
          "|----|------|------|",
          ...data.map((r) => `| ${r.id} | ${r.name} | ${r.type} |`),
        ];

        return { content: [{ type: "text", text: truncateIfNeeded(lines.join("\n")) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${handleApiError(err)}` }], isError: true };
      }
    }
  );

  // ─── Run Report ───────────────────────────────────────────────────
  server.registerTool(
    "quickbase_run_report",
    {
      title: "Run a Report",
      description: `Execute a saved Quickbase report and return its results.

Args:
  - tableId (string): The table the report belongs to
  - reportId (string): The report ID (get from quickbase_list_reports)
  - skip (number, optional): Pagination offset (default: 0)
  - top (number, optional): Max records (default: 100)
  - response_format (string): "markdown" or "json" (default: "markdown")

Returns:
  Report data with all configured filters, sorts, and field selections applied.`,
      inputSchema: z.object({
        tableId: z.string().min(1).describe("Table ID"),
        reportId: z.string().min(1).describe("Report ID (from quickbase_list_reports)"),
        skip: z.number().int().min(0).default(0).describe("Records to skip"),
        top: z.number().int().min(1).max(10000).default(100).describe("Max records"),
        response_format: z.enum(["markdown", "json"]).default("markdown"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ tableId, reportId, skip, top, response_format }) => {
      try {
        const { data } = await client.post<QuickbaseReportRunResult>(
          `/reports/${reportId}/run?tableId=${tableId}`,
          { options: { skip, top } }
        );

        const records = data.data ?? [];
        const fields = data.fields ?? [];
        const meta = data.metadata;

        if (response_format === "json") {
          const output = { totalRecords: meta.totalRecords, returned: meta.numRecords, records, fields };
          return { content: [{ type: "text", text: truncateIfNeeded(JSON.stringify(output, null, 2)) }] };
        }

        const table = formatRecordsAsMarkdown(records, fields);
        const summary = `**Report \`${reportId}\`** | **Total:** ${meta.totalRecords} | **Showing:** ${meta.numRecords}\n\n${table}`;
        return { content: [{ type: "text", text: truncateIfNeeded(summary) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${handleApiError(err)}` }], isError: true };
      }
    }
  );

  // ─── Create Field ─────────────────────────────────────────────────
  server.registerTool(
    "quickbase_create_field",
    {
      title: "Create Field",
      description: `Create a new field (column) in a Quickbase table.

Args:
  - tableId (string): Table to add the field to
  - label (string): Display name for the field
  - fieldType (string): Field data type. Common types:
      "text" — plain text
      "numeric" — number
      "date" — date only
      "timestamp" — date and time
      "checkbox" — true/false
      "url" — web URL
      "email" — email address
      "phone" — phone number
      "currency" — monetary value
      "percent" — percentage
      "rating" — star rating (1-5)
      "multitext" — multi-line text
      "user" — Quickbase user reference
  - required (boolean, optional): Whether the field is required (default: false)
  - unique (boolean, optional): Whether values must be unique (default: false)
  - bold (boolean, optional): Display text in bold (default: false)
  - fieldHelp (string, optional): Help text shown in the UI

Returns:
  The new field's ID, label, and type. Use the field ID when upserting records.`,
      inputSchema: z.object({
        tableId: z.string().min(1).describe("Table ID"),
        label: z.string().min(1).describe("Field display name"),
        fieldType: z.enum([
          "text", "numeric", "date", "timestamp", "checkbox",
          "url", "email", "phone", "currency", "percent",
          "rating", "multitext", "user",
        ]).describe("Field data type"),
        required: z.boolean().default(false).describe("Whether field is required"),
        unique: z.boolean().default(false).describe("Whether values must be unique"),
        bold: z.boolean().default(false).describe("Display text in bold"),
        fieldHelp: z.string().optional().describe("Help text displayed in UI"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ tableId, label, fieldType, required, unique, bold, fieldHelp }) => {
      try {
        const body: Record<string, unknown> = { label, fieldType };
        if (required) body.required = required;
        if (unique) body.unique = unique;
        if (bold) body.bold = bold;
        if (fieldHelp) body.fieldHelp = fieldHelp;

        const { data } = await client.post<QuickbaseFieldCreate>(`/fields?tableId=${tableId}`, body);
        return {
          content: [{
            type: "text",
            text: `✅ Field created!\n- **Label:** ${data.label}\n- **Field ID:** \`${data.id}\`\n- **Type:** ${data.fieldType}\n- **Table:** \`${tableId}\`\n\nUse field ID \`${data.id}\` when querying or upserting records.`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${handleApiError(err)}` }], isError: true };
      }
    }
  );

  // ─── Search Records (convenience) ────────────────────────────────
  server.registerTool(
    "quickbase_search_records",
    {
      title: "Search Records by Text",
      description: `Search for records where any text field contains a given string. Convenience wrapper around quickbase_query_records.

Args:
  - tableId (string): Table to search in
  - fieldId (number): The field ID to search within (e.g. a Name or Description field)
  - searchText (string): The text to look for (partial match using CT operator)
  - top (number, optional): Max results to return (default: 50)
  - response_format (string): "markdown" or "json" (default: "markdown")

Returns:
  Matching records. Use quickbase_list_fields to find field IDs first.

Examples:
  - Search names: fieldId=7, searchText="Smith"
  - Search descriptions: fieldId=12, searchText="urgent"`,
      inputSchema: z.object({
        tableId: z.string().min(1).describe("Table ID"),
        fieldId: z.number().int().positive().describe("Field ID to search within"),
        searchText: z.string().min(1).describe("Text to search for"),
        top: z.number().int().min(1).max(1000).default(50).describe("Max results"),
        response_format: z.enum(["markdown", "json"]).default("markdown"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ tableId, fieldId, searchText, top, response_format }) => {
      try {
        const where = `{${fieldId}.CT.'${searchText.replace(/'/g, "\\'")}'}`;
        const body = { from: tableId, where, options: { top } };

        const { data } = await client.post<QuickbaseQueryResponse>("/records/query", body);
        const records = data.data ?? [];
        const fields = data.fields ?? [];
        const meta = data.metadata;

        if (records.length === 0) {
          return { content: [{ type: "text", text: `No records found matching "${searchText}" in field ${fieldId} of table \`${tableId}\`.` }] };
        }

        if (response_format === "json") {
          return { content: [{ type: "text", text: truncateIfNeeded(JSON.stringify({ totalRecords: meta.totalRecords, returned: meta.numRecords, records, fields }, null, 2)) }] };
        }

        const table = formatRecordsAsMarkdown(records, fields);
        const summary = `**Search: "${searchText}" in field ${fieldId}** | Found: ${meta.totalRecords} total | Showing: ${meta.numRecords}\n\n${table}`;
        return { content: [{ type: "text", text: truncateIfNeeded(summary) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${handleApiError(err)}` }], isError: true };
      }
    }
  );
}
