import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createQuickbaseClient,
  handleApiError,
  truncateIfNeeded,
  QuickbaseConfig,
  QuickbaseApp,
  QuickbaseTable,
  QuickbaseField,
} from "../services/quickbase.js";

export function registerAppTableTools(server: McpServer, config: QuickbaseConfig): void {
  const client = createQuickbaseClient(config);

  // ─── Get App ─────────────────────────────────────────────────────
  server.registerTool(
    "quickbase_get_app",
    {
      title: "Get App Details",
      description: `Retrieve metadata about a Quickbase application by its App ID.

Args:
  - appId (string): The Quickbase application ID (e.g. "bsf8tqhe6")
      Find it in your app's URL or Settings → App Management → Support Information.

Returns:
  App name, description, creation/update timestamps, and configuration details.`,
      inputSchema: z.object({
        appId: z.string().min(1).describe("Quickbase app ID"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ appId }) => {
      try {
        const { data } = await client.get<QuickbaseApp>(`/apps/${appId}`);
        const lines = [
          `**App: ${data.name}**`,
          `- **ID:** \`${data.id}\``,
          ...(data.description ? [`- **Description:** ${data.description}`] : []),
          ...(data.created ? [`- **Created:** ${data.created.iso}`] : []),
          ...(data.updated ? [`- **Updated:** ${data.updated.iso}`] : []),
          ...(data.dateFormat ? [`- **Date Format:** ${data.dateFormat}`] : []),
          ...(data.timeZone ? [`- **Timezone:** ${data.timeZone}`] : []),
        ];
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${handleApiError(err)}` }], isError: true };
      }
    }
  );

  // ─── List Tables ─────────────────────────────────────────────────
  server.registerTool(
    "quickbase_list_tables",
    {
      title: "List Tables in App",
      description: `List all tables in a Quickbase application.

Args:
  - appId (string): The Quickbase application ID

Returns:
  List of tables with their IDs, names, descriptions, and record counts.
  Use table IDs from the output to query records or list fields.`,
      inputSchema: z.object({
        appId: z.string().min(1).describe("Quickbase app ID"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ appId }) => {
      try {
        const { data } = await client.get<QuickbaseTable[]>(`/tables?appId=${appId}`);
        if (!data?.length) {
          return { content: [{ type: "text", text: `No tables found in app \`${appId}\`.` }] };
        }

        const lines = [
          `**Tables in App \`${appId}\`** (${data.length} tables)\n`,
          ...data.map((t, i) => [
            `${i + 1}. **${t.name}** — \`${t.id}\``,
            t.description ? `   ${t.description}` : "",
            t.singleRecordName ? `   Record noun: ${t.singleRecordName}` : "",
          ].filter(Boolean).join("\n")),
        ];

        return { content: [{ type: "text", text: truncateIfNeeded(lines.join("\n")) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${handleApiError(err)}` }], isError: true };
      }
    }
  );

  // ─── Get Table ────────────────────────────────────────────────────
  server.registerTool(
    "quickbase_get_table",
    {
      title: "Get Table Details",
      description: `Get detailed metadata for a specific Quickbase table.

Args:
  - appId (string): The Quickbase app ID
  - tableId (string): The Quickbase table ID

Returns:
  Table name, description, field counts, and configuration.`,
      inputSchema: z.object({
        appId: z.string().min(1).describe("App ID"),
        tableId: z.string().min(1).describe("Table ID"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ appId, tableId }) => {
      try {
        const { data } = await client.get<QuickbaseTable>(`/tables/${tableId}?appId=${appId}`);
        const lines = [
          `**Table: ${data.name}** (\`${data.id}\`)`,
          ...(data.description ? [`- **Description:** ${data.description}`] : []),
          ...(data.alias ? [`- **Alias:** ${data.alias}`] : []),
          ...(data.singleRecordName ? [`- **Single Record:** ${data.singleRecordName}`] : []),
          ...(data.pluralRecordName ? [`- **Plural Records:** ${data.pluralRecordName}`] : []),
          ...(data.nextRecordId !== undefined ? [`- **Next Record ID:** ${data.nextRecordId}`] : []),
          ...(data.nextFieldId !== undefined ? [`- **Next Field ID:** ${data.nextFieldId}`] : []),
          ...(data.created ? [`- **Created:** ${data.created}`] : []),
          ...(data.updated ? [`- **Updated:** ${data.updated}`] : []),
        ];
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${handleApiError(err)}` }], isError: true };
      }
    }
  );

  // ─── List Fields ─────────────────────────────────────────────────
  server.registerTool(
    "quickbase_list_fields",
    {
      title: "List Fields in Table",
      description: `List all fields (columns) defined in a Quickbase table.

Args:
  - tableId (string): The Quickbase table ID
  - includeFieldPerms (boolean, optional): Include field permission info (default: false)

Returns:
  Field IDs, labels, types, and properties. Use field IDs when querying or upserting records.

Common field types: text, numeric, date, checkbox, url, email, phone, user, recordid, formula, lookup`,
      inputSchema: z.object({
        tableId: z.string().min(1).describe("Table ID"),
        includeFieldPerms: z.boolean().default(false).describe("Include field permissions info"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ tableId, includeFieldPerms }) => {
      try {
        const params = new URLSearchParams({ tableId });
        if (includeFieldPerms) params.append("includeFieldPerms", "true");

        const { data } = await client.get<QuickbaseField[]>(`/fields?${params.toString()}`);
        if (!data?.length) {
          return { content: [{ type: "text", text: `No fields found in table \`${tableId}\`.` }] };
        }

        const lines = [
          `**Fields in Table \`${tableId}\`** (${data.length} fields)\n`,
          "| ID | Label | Type | Required | Unique |",
          "|----|-------|------|----------|--------|",
          ...data.map((f) =>
            `| ${f.id} | ${f.label} | ${f.fieldType} | ${f.required ? "✅" : "—"} | ${f.unique ? "✅" : "—"} |`
          ),
        ];

        return { content: [{ type: "text", text: truncateIfNeeded(lines.join("\n")) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${handleApiError(err)}` }], isError: true };
      }
    }
  );

  // ─── Create Table ─────────────────────────────────────────────────
  server.registerTool(
    "quickbase_create_table",
    {
      title: "Create Table",
      description: `Create a new table in a Quickbase application.

Args:
  - appId (string): App to create the table in
  - name (string): Table name (displayed in UI)
  - description (string, optional): Table description
  - singleRecordName (string, optional): Singular noun for a record (e.g. "Task")
  - pluralRecordName (string, optional): Plural noun (e.g. "Tasks")

Returns:
  The new table's ID and details. Add fields next using field management tools.`,
      inputSchema: z.object({
        appId: z.string().min(1).describe("App ID"),
        name: z.string().min(1).describe("Table name"),
        description: z.string().optional().describe("Table description"),
        singleRecordName: z.string().optional().describe("Singular record noun (e.g. 'Task')"),
        pluralRecordName: z.string().optional().describe("Plural record noun (e.g. 'Tasks')"),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ appId, name, description, singleRecordName, pluralRecordName }) => {
      try {
        const body: Record<string, unknown> = { name };
        if (description) body.description = description;
        if (singleRecordName) body.singleRecordName = singleRecordName;
        if (pluralRecordName) body.pluralRecordName = pluralRecordName;

        const { data } = await client.post<QuickbaseTable>(`/tables?appId=${appId}`, body);
        return {
          content: [{
            type: "text",
            text: `✅ Table **"${data.name}"** created successfully!\n- **Table ID:** \`${data.id}\`\n- **App ID:** \`${appId}\`\n\nUse \`quickbase_list_fields\` to see default fields, or create new fields as needed.`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${handleApiError(err)}` }], isError: true };
      }
    }
  );
}
