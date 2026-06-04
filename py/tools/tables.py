"""
Quickbase table and field tools.

Tools:
  - qb_get_table_schema  (P0) — get field definitions for a table
  - qb_list_tables       (P1) — list all tables in an app
"""

import json
from pydantic import BaseModel, Field, ConfigDict
from mcp.server.fastmcp import FastMCP

from client import qb_request, handle_api_error


def register_table_tools(mcp: FastMCP) -> None:
    """Register all table/field tools onto the FastMCP server instance."""

    # ── qb_list_tables (P1) ─────────────────────────────────────────────────

    class ListTablesInput(BaseModel):
        """Input for listing tables in a Quickbase app."""

        model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

        app_id: str = Field(
            ...,
            description="The Quickbase app ID (e.g. 'bqxyz1234'). Obtain from qb_list_apps.",
            min_length=1,
        )

    @mcp.tool(
        name="qb_list_tables",
        annotations={
            "title": "List Tables in a Quickbase App",
            "readOnlyHint": True,
            "destructiveHint": False,
            "idempotentHint": True,
            "openWorldHint": True,
        },
    )
    async def qb_list_tables(params: ListTablesInput) -> str:
        """
        List all tables in a Quickbase app.

        Returns table IDs and names. Use the table ID with qb_get_table_schema
        to inspect fields, or with qb_query_records to fetch records.

        Args:
            params (ListTablesInput):
                - app_id (str): The app ID to list tables for.

        Returns:
            str: JSON array of table objects:
                [
                    {
                        "id": str,           # Table ID (e.g. "bqxyz.1")
                        "name": str,         # Table display name
                        "alias": str,        # Table alias
                        "description": str   # Table description
                    },
                    ...
                ]

                Error: "<message>" on failure.

        Examples:
            - Use when: You know an app ID and want to discover what tables it contains.
            - Don't use when: You already know the table ID — go straight to qb_query_records.
        """
        try:
            data = await qb_request("GET", "/tables", params={"appId": params.app_id})
            tables = data if isinstance(data, list) else data.get("tables", [])
            result = [
                {
                    "id": t.get("id"),
                    "name": t.get("name"),
                    "alias": t.get("alias", ""),
                    "description": t.get("description", ""),
                }
                for t in tables
            ]
            return json.dumps(result, indent=2)
        except Exception as e:
            return handle_api_error(e)

    # ── qb_get_table_schema (P0) ─────────────────────────────────────────────

    class GetTableSchemaInput(BaseModel):
        """Input for retrieving a table's field schema."""

        model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

        table_id: str = Field(
            ...,
            description="The Quickbase table ID (e.g. 'bqxyz.1'). Obtain from qb_list_tables.",
            min_length=1,
        )

    @mcp.tool(
        name="qb_get_table_schema",
        annotations={
            "title": "Get Quickbase Table Schema",
            "readOnlyHint": True,
            "destructiveHint": False,
            "idempotentHint": True,
            "openWorldHint": True,
        },
    )
    async def qb_get_table_schema(params: GetTableSchemaInput) -> str:
        """
        Get the field definitions (schema) for a Quickbase table.

        Returns field IDs, labels, and data types. Field IDs are required when
        constructing queries or writing records with other tools.

        Args:
            params (GetTableSchemaInput):
                - table_id (str): The table ID to inspect.

        Returns:
            str: JSON array of field objects:
                [
                    {
                        "id": int,          # Numeric field ID used in queries/writes
                        "label": str,       # Human-readable field name
                        "fieldType": str,   # Data type (e.g. "text", "numeric", "date")
                        "required": bool,   # Whether field is required on record creation
                        "unique": bool      # Whether field values must be unique
                    },
                    ...
                ]

                Error: "<message>" on failure.

        Examples:
            - Use when: You need field IDs to construct a qb_query_records filter or write records.
            - Don't use when: You already know the field IDs for your query.
        """
        try:
            data = await qb_request("GET", "/fields", params={"tableId": params.table_id})
            fields = data if isinstance(data, list) else data.get("fields", [])
            result = [
                {
                    "id": f.get("id"),
                    "label": f.get("label"),
                    "fieldType": f.get("fieldType"),
                    "required": f.get("required", False),
                    "unique": f.get("unique", False),
                }
                for f in fields
            ]
            return json.dumps(result, indent=2)
        except Exception as e:
            return handle_api_error(e)
