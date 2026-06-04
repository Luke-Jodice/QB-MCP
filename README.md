# Quickbase MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that lets Claude and other LLMs interact with [Quickbase](https://www.quickbase.com) apps, tables, and records through natural language.

Two implementations are provided — choose whichever fits your stack:

| | Python (`py/`) | TypeScript (`TS/`) |
|---|---|---|
| Runtime | Python 3.10+ | Node.js 18+ |
| Tools | 8 | 13 |
| Transport | stdio · HTTP (port 8000) | stdio · HTTP (port 3000) |
| Dependencies | FastMCP, httpx, pydantic | MCP SDK, axios, zod, express |

---

## Prerequisites

- A [Quickbase](https://www.quickbase.com) account with API access
- A Quickbase **User Token** (not a temp token)

### Getting credentials

**User Token**
1. Log into Quickbase
2. Click your avatar (top right) → **My Preferences**
3. Under **Manage User Tokens**, create a new token
4. Copy the value (starts with `b_...`)

**Realm Hostname**
Your realm hostname is the subdomain in your Quickbase URL:
`https://yourcompany.quickbase.com` → realm = `yourcompany.quickbase.com`

**App & Table IDs**
- **App ID**: Open your app → Settings → App Management → Support Information
- **Table IDs**: Listed on the same Support Information page, or visible in table URLs

---

## Python Implementation (`py/`)

### Setup

```bash
cd py

# Install dependencies
pip install -r requirements.txt

# Configure credentials
cp .env.example .env
# Edit .env and set QB_USER_TOKEN and QB_REALM_HOSTNAME
```

### Running

```bash
# stdio (for Claude Desktop / local use)
python server.py

# Streamable HTTP on port 8000
python server.py --transport http

# Inspect with MCP Inspector
npx @modelcontextprotocol/inspector python server.py
```

### Claude Desktop config

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "quickbase": {
      "command": "python",
      "args": ["/absolute/path/to/QB-MCP/py/server.py"],
      "env": {
        "QB_USER_TOKEN": "your_token_here",
        "QB_REALM_HOSTNAME": "yourcompany.quickbase.com"
      }
    }
  }
}
```

### Available tools (Python)

| Tool | Description |
|---|---|
| `qb_list_apps` | List all Quickbase apps accessible to the authenticated user |
| `qb_list_tables` | List all tables in a Quickbase app |
| `qb_get_table_schema` | Get field definitions (ID, label, type) for a table |
| `qb_query_records` | Query records with optional filters, field selection, and sorting |
| `qb_create_record` | Insert a new record into a table |
| `qb_update_record` | Update fields on an existing record by record ID |
| `qb_delete_record` | Delete one or more records by record ID |
| `qb_run_report` | Execute a saved Quickbase report and return its records |

### Project structure (Python)

```
py/
├── server.py          # FastMCP server entry point
├── client.py          # Quickbase API client + error handling
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

## TypeScript Implementation (`TS/`)

### Setup

```bash
cd TS

# Install dependencies
npm install

# Build
npm run build

# Set environment variables
export QB_USER_TOKEN=b_your_token_here
export QB_REALM_HOSTNAME=yourcompany.quickbase.com
```

### Running

```bash
# stdio (for Claude Desktop / local use)
npm start

# HTTP on port 3000
TRANSPORT=http PORT=3000 npm start

# Health check (HTTP mode)
curl http://localhost:3000/health
```

### Claude Desktop config

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "quickbase": {
      "command": "node",
      "args": ["/absolute/path/to/QB-MCP/TS/dist/index.js"],
      "env": {
        "QB_USER_TOKEN": "b_your_token_here",
        "QB_REALM_HOSTNAME": "yourcompany.quickbase.com"
      }
    }
  }
}
```

### Available tools (TypeScript)

| Tool | Description |
|---|---|
| `quickbase_query_records` | Query records with filters, sorting, and pagination |
| `quickbase_get_record` | Fetch a single record by ID |
| `quickbase_upsert_records` | Create or update records (upsert with optional merge field) |
| `quickbase_delete_records` | Delete records matching a query |
| `quickbase_get_app` | Get app metadata |
| `quickbase_list_tables` | List all tables in an app |
| `quickbase_get_table` | Get table details |
| `quickbase_list_fields` | List all fields (columns) in a table |
| `quickbase_create_field` | Add a new field to a table |
| `quickbase_create_table` | Create a new table in an app |
| `quickbase_list_reports` | List saved reports in a table |
| `quickbase_run_report` | Execute a saved report |
| `quickbase_search_records` | Search records by text in a specific field |

### Project structure (TypeScript)

```
TS/
├── index.ts               # Server entry point (stdio / HTTP)
├── quickbase.ts           # Quickbase API client + types
├── records.ts             # Record tools (query, get, upsert, delete, search)
├── apps-tables.ts         # App + table tools (get app, list/get/create tables, list/create fields)
├── reports-fields.ts      # Report tools (list, run)
├── package.json
└── tsconfig.json
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `QB_USER_TOKEN` | Yes | Your Quickbase user token |
| `QB_REALM_HOSTNAME` | Yes | Your realm (e.g. `yourcompany.quickbase.com`) |
| `TRANSPORT` | No (TS only) | `stdio` (default) or `http` |
| `PORT` | No (TS only) | HTTP port (default: `3000`) |

> The Python server reads from a `.env` file via `python-dotenv`. The TypeScript server reads from the process environment only; use `export` or your shell's env injection.

---

## Typical workflow

```
[Python]  qb_list_apps                     → get app IDs
[Python]  qb_list_tables(app_id)           → get table IDs
[Both]    qb_get_table_schema / quickbase_list_fields → get field IDs + types
[Both]    qb_query_records / quickbase_query_records  → fetch / filter data
[Both]    qb_create_record / quickbase_upsert_records → write data
```

## Query syntax

Quickbase uses a formula-style query syntax:

```
{fieldId.OPERATOR.value}
```

| Operator | Meaning |
|---|---|
| `EX` | Equals |
| `CT` | Contains |
| `GT` | Greater than |
| `LT` | Less than |
| `GTE` | Greater than or equal |
| `LTE` | Less than or equal |
| `SW` | Starts with |
| `BEF` | Date before |
| `AF` | Date after |

Combine with `AND` / `OR`:

```
{6.EX.'Active'} AND {7.CT.'Smith'}
{8.GT.100} OR {8.LT.0}
```

---

## Example prompts

Once connected to Claude, you can ask things like:

- *"List all my Quickbase apps"*
- *"Show me the tables in app `bsf8tqhe6`"*
- *"What fields are in table `abc12345`?"*
- *"Query all active records in table `xyz789` where Status equals Active"*
- *"Create a new record in table `abc123` with Name = 'Project Alpha' and Status = 'Open'"*
- *"Update record #42 — set its status to Resolved"*
- *"Search table `def456` for records where the description contains 'urgent'"*
- *"Run report `1` from table `abc123`"*
- *"Delete all records in table `xyz` where field 6 equals 'Archived'"*

---

## Security

- Never commit your user token to version control
- Use environment variables or a secrets manager
- User tokens carry the same permissions as the user who created them — use a service account with limited permissions for production deployments
- For HTTP transport, run behind a reverse proxy with TLS and authentication in production

---

## Development

### Python

```bash
cd py

# Verify syntax
python -m py_compile server.py client.py tools/*.py

# Lint
ruff check .

# Run tests (when added)
pytest
```

### TypeScript

```bash
cd TS

# Type-check + build
npm run build

# Run in development mode (no build step)
npx ts-node index.ts
```
