# Quickbase MCP Server

A Model Context Protocol (MCP) server that enables Claude to interact with [Quickbase](https://www.quickbase.com/) via its REST API.

## Features

This server exposes **10 tools** covering the most important Quickbase operations:

| Tool | Description |
|------|-------------|
| `quickbase_query_records` | Query records with filters, sorting, and pagination |
| `quickbase_get_record` | Fetch a single record by ID |
| `quickbase_upsert_records` | Create or update records |
| `quickbase_delete_records` | Delete records matching a query |
| `quickbase_get_app` | Get app metadata |
| `quickbase_list_tables` | List all tables in an app |
| `quickbase_get_table` | Get table details |
| `quickbase_list_fields` | List all fields (columns) in a table |
| `quickbase_create_field` | Add a new field to a table |
| `quickbase_create_table` | Create a new table in an app |
| `quickbase_list_reports` | List saved reports |
| `quickbase_run_report` | Execute a saved report |
| `quickbase_search_records` | Search records by text in a specific field |

## Prerequisites

- Node.js 18+
- A Quickbase account with API access
- A Quickbase **User Token** (not a temp token)

## Getting Your Quickbase Credentials

### User Token
1. Log into Quickbase
2. Click your avatar (top right) → **My Preferences**
3. Under **Manage User Tokens**, create a new token
4. Copy the token value (starts with `b_...`)

### Realm Hostname
Your realm hostname is the subdomain in your Quickbase URL:  
`https://yourcompany.quickbase.com` → realm = `yourcompany.quickbase.com`

### App ID & Table IDs
- **App ID**: Open your app → Settings → App Management → Support Information
- **Table IDs**: Listed on the same Support Information page, or visible in table URLs

## Installation

```bash
# 1. Clone or copy this project
cd quickbase-mcp-server

# 2. Install dependencies
npm install

# 3. Build TypeScript
npm run build

# 4. Set environment variables
export QB_USER_TOKEN=b_your_token_here
export QB_REALM_HOSTNAME=yourcompany.quickbase.com
```

## Running the Server

### stdio (for Claude Desktop / local MCP clients)

```bash
npm start
```

### HTTP (for remote/web clients)

```bash
TRANSPORT=http PORT=3000 npm start
```

Health check: `GET http://localhost:3000/health`

## Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "quickbase": {
      "command": "node",
      "args": ["/absolute/path/to/quickbase-mcp-server/dist/index.js"],
      "env": {
        "QB_USER_TOKEN": "b_your_token_here",
        "QB_REALM_HOSTNAME": "yourcompany.quickbase.com"
      }
    }
  }
}
```

## Example Prompts

Once connected, you can ask Claude things like:

- *"List all tables in my app `bsf8tqhe6`"*
- *"Show me the fields in table `abc12345`"*
- *"Query all active records in table `xyz789` where Status equals Active"*
- *"Create a new record in table `abc123` with Name = 'Project Alpha' and Status = 'Open'"*
- *"Search table `def456` for records where the description contains 'urgent'"*
- *"Run report `1` from table `abc123`"*
- *"Delete all records in table `xyz` where field 6 equals 'Archived'"*

## Query Syntax

Quickbase uses a custom query syntax:

```
{fieldId.operator.value}
```

**Operators:**
| Operator | Meaning |
|----------|---------|
| `EX` | Equals |
| `CT` | Contains |
| `GT` | Greater than |
| `LT` | Less than |
| `GTE` | Greater than or equal |
| `LTE` | Less than or equal |
| `SW` | Starts with |
| `BEF` | Date before |
| `AF` | Date after |

**Combining conditions:**
```
{6.EX.'Active'} AND {7.CT.'Smith'}
{8.GT.100} OR {8.LT.0}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `QB_USER_TOKEN` | ✅ | Your Quickbase user token |
| `QB_REALM_HOSTNAME` | ✅ | Your realm (e.g. `company.quickbase.com`) |
| `TRANSPORT` | ❌ | `stdio` (default) or `http` |
| `PORT` | ❌ | HTTP port (default: `3000`) |

## Security Notes

- Never commit your user token to version control
- Use environment variables or a secrets manager
- User tokens have the same permissions as the user who created them — use a service account with limited permissions for production
