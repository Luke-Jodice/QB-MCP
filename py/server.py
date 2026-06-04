#!/usr/bin/env python3
"""
Quickbase MCP Server

Exposes Quickbase apps, tables, and records as MCP tools so LLMs like Claude
can interact with Quickbase data through natural language.

Environment variables required (copy .env.example → .env):
  QB_USER_TOKEN      — Your Quickbase user token
  QB_REALM_HOSTNAME  — Your Quickbase realm hostname (e.g. mycompany.quickbase.com)

Usage:
  python server.py                    # stdio transport (for Claude Desktop / local use)
  python server.py --transport http   # Streamable HTTP on port 8000

MCP Inspector:
  npx @modelcontextprotocol/inspector python server.py
"""

import argparse
from mcp.server.fastmcp import FastMCP

from tools import (
    register_app_tools,
    register_table_tools,
    register_record_tools,
    register_report_tools,
)

mcp = FastMCP(
    "quickbase_mcp",
    instructions=(
        "This server provides tools to interact with Quickbase apps, tables, and records. "
        "Start by calling qb_list_apps to discover available apps, then qb_list_tables to see "
        "tables within an app, qb_get_table_schema to learn field IDs, and finally "
        "qb_query_records to fetch data. Use qb_create_record / qb_update_record / "
        "qb_delete_record to write data. Use qb_run_report to execute saved reports."
    ),
)

# Register all tool groups
register_app_tools(mcp)
register_table_tools(mcp)
register_record_tools(mcp)
register_report_tools(mcp)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Quickbase MCP Server")
    parser.add_argument(
        "--transport",
        choices=["stdio", "http"],
        default="stdio",
        help="Transport to use: 'stdio' (default, for local/desktop use) or 'http' (port 8000)",
    )
    args = parser.parse_args()

    if args.transport == "http":
        mcp.run(transport="streamable-http", port=8000)
    else:
        mcp.run()
