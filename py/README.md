# quickbase-mcp

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that lets Claude and other LLMs interact with [Quickbase](https://www.quickbase.com) apps, tables, and records through natural language.

---

## Installation

```bash
# 1. Clone the repo
git clone https://github.com/yourusername/quickbase-mcp.git
cd quickbase-mcp

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure credentials
cp .env.example .env
# Edit .env and set QB_USER_TOKEN and QB_REALM_HOSTNAME
```

---

## Configuration

Set these environment variables (or use a `.env` file):

| Variable | Description | Example |
|---|---|---|
| `QB_USER_TOKEN` | Your Quickbase user token | `b9tgk3_abc123...` |
| `QB_REALM_HOSTNAME` | Your Quickbase realm hostname | `mycompany.quickbase.com` |

Get your user token at: **Quickbase → Settings → My Preferences → Manage User Tokens**

---

## Usage

### With Claude Desktop (stdio)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "quickbase": {
      "command": "python",
      "args": ["/path/to/quickbase-mcp/server.py"],
      "env": {
        "QB_USER_TOKEN": "your_token",
        "QB_REALM_HOSTNAME": "yourcompany.quickbase.com"
      }
    }
  }
}
```

### As a remote HTTP server

```bash
python server.py --transport http
# Server starts on http://localhost:8000
```

### Inspect with MCP Inspector

```bash
npx @modelcontextprotocol/inspector python server.py
```

---

## Available Tools

| Tool | Priority | Description |
|---|---|---|
| `qb_list_apps` | P0 | List all Quickbase apps accessible to the authenticated user |
| `qb_get_table_schema` | P0 | Get field definitions (ID, label, type) for a table |
| `qb_query_records` | P0 | Query records with optional filters, field selection, and sorting |
| `qb_create_record` | P0 | Insert a new record into a table |
| `qb_update_record` | P0 | Update fields on an existing record by record ID |
| `qb_delete_record` | P0 | Delete one or more records by record ID |
| `qb_list_tables` | P1 | List all tables in a Quickbase app |
| `qb_run_report` | P1 | Execute a saved Quickbase report and return its records |

### Typical workflow

```
qb_list_apps                     → get app IDs
  └─ qb_list_tables(app_id)      → get table IDs
       └─ qb_get_table_schema    → get field IDs + types
            └─ qb_query_records  → fetch/filter data
```

---

## Project Structure

```
quickbase-mcp/
├── server.py          # FastMCP server entry point
├── client.py          # Shared Quickbase API client + error handling
├── tools/
│   ├── __init__.py    # Re-exports register_*_tools functions
│   ├── apps.py        # qb_list_apps
│   ├── tables.py      # qb_list_tables, qb_get_table_schema
│   ├── records.py     # qb_query_records, qb_create_record, qb_update_record, qb_delete_record
│   └── reports.py     # qb_run_report
├── requirements.txt
└── .env.example
```

---

## Development

```bash
# Verify syntax
python -m py_compile server.py client.py tools/*.py

# Run tests (when added)
pytest

# Lint
ruff check .
```

---

---

# Product Requirements Document (PRD)

> This PRD lives alongside the code so implementation decisions stay grounded in the original product thinking.

## Problem Statement

Developers and business users who manage data in Quickbase cannot leverage AI assistants like Claude to interact with their apps, tables, and records through natural language. There is no MCP connector for Quickbase, meaning every interaction requires manual navigation of the UI or raw REST API calls. As LLM-powered workflows become standard, the absence of a Quickbase MCP server leaves a large base of enterprise Quickbase users unable to incorporate their operational data into AI-driven automation.

## Goals

1. Enable Claude and other MCP-compatible LLMs to query, create, update, and delete Quickbase records through natural language.
2. Reduce the time to build AI-assisted Quickbase workflows from days (custom integration code) to minutes (MCP install + prompt).
3. Make Quickbase app and table schemas discoverable by AI agents at runtime so no hardcoded IDs are required.
4. Ship a working open-source server that can be listed on the MCP registry and used by any Quickbase customer.
5. Achieve at least 50 installs within 60 days of publishing.

## Non-Goals

- **Building a full Quickbase admin UI replacement** — this is a data access layer, not an app builder.
- **Supporting Quickbase Pipelines / automation triggers** — workflow automation is out of scope for v1; focus is CRUD + reporting.
- **Multi-tenant / SaaS hosting** — v1 ships as a self-hosted server; cloud-hosted version is a future consideration.
- **Supporting other low-code platforms (Airtable, monday.com)** — keep scope to Quickbase only to ship fast and learn.
- **OAuth user-level auth flows** — v1 uses user token auth; OAuth delegation is a v2 concern.

## User Stories

### Developer / Builder
- As a developer building an internal tool, I want to query Quickbase records by field value so that I can surface relevant data in an AI workflow without writing API boilerplate.
- As a developer, I want the MCP server to expose the schema of any Quickbase table so that Claude can dynamically construct correct queries without me hardcoding field IDs.
- As a developer, I want to create and update Quickbase records from a Claude prompt so that I can automate data entry tasks.

### Business / Power User
- As a business analyst, I want to ask Claude questions about my Quickbase data in plain English so that I can get answers without knowing the Quickbase query syntax.
- As an operations manager, I want Claude to pull a filtered list of records and summarize them so that I can get a status update without opening Quickbase.
- As a power user, I want to run an existing Quickbase report through Claude so that I can incorporate report data into a larger AI workflow.

### Admin
- As an admin, I want to configure the MCP server with my Quickbase user token and realm hostname so that I control which credentials are used and can revoke access at any time.

## Requirements

### Must-Have (P0) — Implemented ✅

- **qb_list_apps** — list all apps the authenticated user can access.
- **qb_get_table_schema** — return field definitions (ID, label, type) for a given table.
- **qb_query_records** — query records with optional filters, sorting, and pagination.
- **qb_create_record** — insert a new record with a field → value map.
- **qb_update_record** — update fields on an existing record by record ID.
- **qb_delete_record** — delete records by record ID.
- **Configuration** — server reads `QB_USER_TOKEN` and `QB_REALM_HOSTNAME` from environment.

### Nice-to-Have (P1) — Partially Implemented

- **qb_run_report** ✅ — execute an existing saved report by report ID.
- **qb_list_tables** ✅ — list all tables within an app.
- **Upsert Record** ⬜ — create-or-update based on a match field.
- **Bulk Insert** ⬜ — accept an array of records to insert in one call.
- **Field Label Resolution** ⬜ — allow queries to use human-readable labels instead of numeric field IDs.

### Future Considerations (P2)

- OAuth 2.0 user delegation so the server can act on behalf of individual users.
- Webhook support — register/deregister Quickbase webhooks as tools.
- Cloud-hosted version with per-user credential storage.
- Support for Quickbase Pipelines triggers.
- File attachment upload/download.

## Success Metrics

### Leading Indicators (first 30 days)
- MCP registry install count ≥ 25 within 30 days of publish.
- GitHub stars ≥ 50 within 30 days.
- Zero critical bug reports against P0 tools in the first two weeks.

### Lagging Indicators (60–90 days)
- 50+ installs within 60 days.
- At least 3 community-contributed examples or integrations.
- Positive mention or adoption signal from the Quickbase developer community.

## Open Questions

| # | Question | Owner | Blocking? |
|---|----------|-------|-----------|
| 1 | Does the Quickbase REST API v2 support all required operations with a user token, or are some endpoints restricted to OAuth? | Engineering | Yes |
| 2 | What rate limits does Quickbase enforce per user token, and should the server implement retry/backoff? | Engineering | No |
| 3 | Should field IDs be exposed as integers or strings in tool parameters? Quickbase uses integers internally. | Engineering | No |
| 4 | Is there demand for a TypeScript implementation in addition to Python? | Strategy | No |

## Timeline Considerations

- **No hard deadline** — open-source side project; ship when P0 tools are solid.
- **Suggested phasing:**
  - *Phase 1*: P0 read tools (List Apps, Get Schema, Query Records) → publish to MCP registry.
  - *Phase 2*: Write tools (Create, Update, Delete) → polish errors, write examples in README.
  - *Phase 3*: P1 tools (Run Report, List Tables, Upsert, Bulk Insert) → community feedback.
- **Dependency**: Confirm Quickbase API user token scope before Phase 2 write tools (Open Question #1).
