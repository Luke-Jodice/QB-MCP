import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

import { QuickbaseConfig } from "./services/quickbase.js";
import { registerRecordTools } from "./tools/records.js";
import { registerAppTableTools } from "./tools/apps-tables.js";
import { registerReportAndFieldTools } from "./tools/reports-fields.js";

function loadConfig(): QuickbaseConfig {
  const userToken = process.env.QB_USER_TOKEN;
  const realmHostname = process.env.QB_REALM_HOSTNAME;

  if (!userToken) {
    console.error("❌ Missing required env var: QB_USER_TOKEN");
    console.error("   Set your Quickbase user token: export QB_USER_TOKEN=your_token_here");
    process.exit(1);
  }
  if (!realmHostname) {
    console.error("❌ Missing required env var: QB_REALM_HOSTNAME");
    console.error("   Set your Quickbase realm: export QB_REALM_HOSTNAME=yourcompany.quickbase.com");
    process.exit(1);
  }

  return { userToken, realmHostname };
}

function createServer(config: QuickbaseConfig): McpServer {
  const server = new McpServer({
    name: "quickbase-mcp-server",
    version: "1.0.0",
  });

  registerRecordTools(server, config);
  registerAppTableTools(server, config);
  registerReportAndFieldTools(server, config);

  return server;
}

async function runStdio(): Promise<void> {
  const config = loadConfig();
  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`✅ Quickbase MCP server running (stdio) — realm: ${config.realmHostname}`);
}

async function runHTTP(): Promise<void> {
  const config = loadConfig();
  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    const server = createServer(config);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", realm: config.realmHostname });
  });

  const port = parseInt(process.env.PORT ?? "3000");
  app.listen(port, () => {
    console.error(`✅ Quickbase MCP server running on http://localhost:${port}/mcp — realm: ${config.realmHostname}`);
  });
}

const transport = process.env.TRANSPORT ?? "stdio";
if (transport === "http") {
  runHTTP().catch((err) => {
    console.error("Server error:", err);
    process.exit(1);
  });
} else {
  runStdio().catch((err) => {
    console.error("Server error:", err);
    process.exit(1);
  });
}
