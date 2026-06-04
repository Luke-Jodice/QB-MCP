"""
Quickbase record tools.

Tools:
  - qb_query_records  (P0) — query records with optional filters
  - qb_create_record  (P0) — insert a new record
  - qb_update_record  (P0) — update fields on an existing record
  - qb_delete_record  (P0) — delete a record by record ID
"""

import json
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict, field_validator
from mcp.server.fastmcp import FastMCP

from client import qb_request, handle_api_error


def _build_field_value(value: Any) -> Dict[str, Any]:
    """Wrap a plain Python value in Quickbase's {"value": ...} envelope."""
    return {"value": value}


def _format_records(records: List[Dict]) -> List[Dict]:
    """
    Flatten Quickbase's field-envelope format to plain dicts.

    Input:  [{"3": {"value": "Alice"}, "6": {"value": 42}}, ...]
    Output: [{"3": "Alice", "6": 42}, ...]
    """
    return [
        {str(fid): fdata.get("value") for fid, fdata in record.items()}
        for record in records
    ]


def register_record_tools(mcp: FastMCP) -> None:
    """Register all record-level tools onto the FastMCP server instance."""

    # ── qb_query_records (P0) ────────────────────────────────────────────────

    class QueryRecordsInput(BaseModel):
        """Input for querying Quickbase records."""

        model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

        table_id: str = Field(
            ...,
            description="The Quickbase table ID to query (e.g. 'bqxyz.1').",
            min_length=1,
        )
        where: Optional[str] = Field(
            default=None,
            description=(
                "Quickbase formula-style filter string, e.g. \"{6}.EX.'open'\". "
                "Omit to return all records (subject to limit)."
            ),
        )
        select: Optional[List[int]] = Field(
            default=None,
            description=(
                "List of field IDs to include in results. "
                "Omit to return all fields. Use qb_get_table_schema to discover field IDs."
            ),
        )
        sort_by: Optional[List[Dict[str, Any]]] = Field(
            default=None,
            description=(
                "Sort specification, e.g. [{\"fieldId\": 6, \"order\": \"ASC\"}]."
            ),
        )
        limit: int = Field(
            default=100,
            description="Maximum number of records to return (1–1000).",
            ge=1,
            le=1000,
        )
        skip: int = Field(
            default=0,
            description="Number of records to skip for pagination.",
            ge=0,
        )

    @mcp.tool(
        name="qb_query_records",
        annotations={
            "title": "Query Quickbase Records",
            "readOnlyHint": True,
            "destructiveHint": False,
            "idempotentHint": True,
            "openWorldHint": True,
        },
    )
    async def qb_query_records(params: QueryRecordsInput) -> str:
        """
        Query records in a Quickbase table with optional filters, field selection, and sorting.

        Uses the Quickbase Records Query API (POST /v1/records/query). Filters use
        Quickbase's formula syntax: {fieldId}.OPERATOR.'value'.

        Args:
            params (QueryRecordsInput):
                - table_id (str): Table to query.
                - where (str, optional): Filter formula (e.g. "{6}.EX.'open'").
                - select (List[int], optional): Field IDs to return.
                - sort_by (List[dict], optional): Sort order.
                - limit (int): Max records to return (default 100, max 1000).
                - skip (int): Records to skip for pagination (default 0).

        Returns:
            str: JSON object:
                {
                    "fields": [{"id": int, "label": str, "type": str}, ...],
                    "records": [{"<fieldId>": <value>, ...}, ...],
                    "metadata": {
                        "totalRecords": int,
                        "numRecords": int,
                        "skip": int,
                        "hasMore": bool
                    }
                }

                Error: "<message>" on failure.

        Examples:
            - Use when: "Get all open tickets from the Issues table"
              → params with where="{status_field_id}.EX.'open'"
            - Use when: "Show me the last 10 records sorted by date"
              → params with limit=10, sort_by=[{"fieldId": <date_field_id>, "order": "DESC"}]
        """
        try:
            body: Dict[str, Any] = {
                "from": params.table_id,
                "options": {"skip": params.skip, "top": params.limit},
            }
            if params.where:
                body["where"] = params.where
            if params.select:
                body["select"] = params.select
            if params.sort_by:
                body["sortBy"] = params.sort_by

            data = await qb_request("POST", "/records/query", json=body)

            fields = data.get("fields", [])
            raw_records = data.get("data", [])
            metadata = data.get("metadata", {})

            flat_records = _format_records(raw_records)
            total = metadata.get("totalRecords", len(flat_records))
            num = metadata.get("numRecords", len(flat_records))

            result = {
                "fields": [
                    {"id": f.get("id"), "label": f.get("label"), "type": f.get("type")}
                    for f in fields
                ],
                "records": flat_records,
                "metadata": {
                    "totalRecords": total,
                    "numRecords": num,
                    "skip": params.skip,
                    "hasMore": (params.skip + num) < total,
                },
            }
            return json.dumps(result, indent=2)
        except Exception as e:
            return handle_api_error(e)

    # ── qb_create_record (P0) ────────────────────────────────────────────────

    class CreateRecordInput(BaseModel):
        """Input for creating a new Quickbase record."""

        model_config = ConfigDict(extra="forbid")

        table_id: str = Field(
            ...,
            description="The table ID to insert the record into.",
            min_length=1,
        )
        fields: Dict[str, Any] = Field(
            ...,
            description=(
                "Map of field ID (as string) to value, e.g. {\"6\": \"open\", \"7\": \"Bug report\"}. "
                "Use qb_get_table_schema to find field IDs and types."
            ),
        )

        @field_validator("fields")
        @classmethod
        def fields_not_empty(cls, v: Dict) -> Dict:
            if not v:
                raise ValueError("fields must contain at least one field/value pair.")
            return v

    @mcp.tool(
        name="qb_create_record",
        annotations={
            "title": "Create a Quickbase Record",
            "readOnlyHint": False,
            "destructiveHint": False,
            "idempotentHint": False,
            "openWorldHint": True,
        },
    )
    async def qb_create_record(params: CreateRecordInput) -> str:
        """
        Insert a new record into a Quickbase table.

        Args:
            params (CreateRecordInput):
                - table_id (str): Table to insert into.
                - fields (dict): Field ID → value map (field IDs as strings).

        Returns:
            str: JSON object on success:
                {
                    "recordId": int,      # The new record's ID
                    "createdRecordIds": [int],
                    "unchangedRecordIds": [],
                    "updatedRecordIds": []
                }

                Error: "<message>" on failure.

        Examples:
            - Use when: "Create a new ticket with status 'open' and title 'Login bug'"
              → params with fields={"6": "open", "7": "Login bug"}
        """
        try:
            # Build Quickbase field envelope format
            data_fields = {
                int(fid): _build_field_value(val)
                for fid, val in params.fields.items()
            }
            body = {"to": params.table_id, "data": [data_fields]}
            data = await qb_request("POST", "/records", json=body)

            created_ids = data.get("metadata", {}).get("createdRecordIds", [])
            result = {
                "recordId": created_ids[0] if created_ids else None,
                "createdRecordIds": created_ids,
                "unchangedRecordIds": data.get("metadata", {}).get("unchangedRecordIds", []),
                "updatedRecordIds": data.get("metadata", {}).get("updatedRecordIds", []),
            }
            return json.dumps(result, indent=2)
        except Exception as e:
            return handle_api_error(e)

    # ── qb_update_record (P0) ────────────────────────────────────────────────

    class UpdateRecordInput(BaseModel):
        """Input for updating an existing Quickbase record."""

        model_config = ConfigDict(extra="forbid")

        table_id: str = Field(..., description="The table ID containing the record.", min_length=1)
        record_id: int = Field(
            ...,
            description="The numeric record ID to update (field 3 in Quickbase).",
            ge=1,
        )
        fields: Dict[str, Any] = Field(
            ...,
            description=(
                "Map of field ID (as string) to new value. "
                "Only include fields you want to change."
            ),
        )

        @field_validator("fields")
        @classmethod
        def fields_not_empty(cls, v: Dict) -> Dict:
            if not v:
                raise ValueError("fields must contain at least one field/value pair.")
            return v

    @mcp.tool(
        name="qb_update_record",
        annotations={
            "title": "Update a Quickbase Record",
            "readOnlyHint": False,
            "destructiveHint": False,
            "idempotentHint": True,
            "openWorldHint": True,
        },
    )
    async def qb_update_record(params: UpdateRecordInput) -> str:
        """
        Update one or more fields on an existing Quickbase record.

        Args:
            params (UpdateRecordInput):
                - table_id (str): Table containing the record.
                - record_id (int): Record ID to update (the value of field 3).
                - fields (dict): Field ID → new value map.

        Returns:
            str: JSON object on success:
                {
                    "updatedRecordIds": [int],
                    "unchangedRecordIds": [int],
                    "createdRecordIds": []
                }

                Error: "<message>" on failure.

        Examples:
            - Use when: "Mark ticket #42 as resolved"
              → params with record_id=42, fields={"6": "resolved"}
        """
        try:
            data_fields = {int(fid): _build_field_value(val) for fid, val in params.fields.items()}
            # Quickbase requires record ID in field 3
            data_fields[3] = _build_field_value(params.record_id)
            body = {"to": params.table_id, "data": [data_fields]}
            data = await qb_request("POST", "/records", json=body)

            meta = data.get("metadata", {})
            result = {
                "updatedRecordIds": meta.get("updatedRecordIds", []),
                "unchangedRecordIds": meta.get("unchangedRecordIds", []),
                "createdRecordIds": meta.get("createdRecordIds", []),
            }
            return json.dumps(result, indent=2)
        except Exception as e:
            return handle_api_error(e)

    # ── qb_delete_record (P0) ────────────────────────────────────────────────

    class DeleteRecordInput(BaseModel):
        """Input for deleting a Quickbase record."""

        model_config = ConfigDict(extra="forbid")

        table_id: str = Field(..., description="The table ID containing the record.", min_length=1)
        record_ids: List[int] = Field(
            ...,
            description="One or more record IDs to delete.",
            min_length=1,
            max_length=100,
        )

    @mcp.tool(
        name="qb_delete_record",
        annotations={
            "title": "Delete Quickbase Record(s)",
            "readOnlyHint": False,
            "destructiveHint": True,
            "idempotentHint": False,
            "openWorldHint": True,
        },
    )
    async def qb_delete_record(params: DeleteRecordInput) -> str:
        """
        Delete one or more records from a Quickbase table by record ID.

        This operation is destructive and cannot be undone. Always confirm the
        record IDs before calling this tool.

        Args:
            params (DeleteRecordInput):
                - table_id (str): Table containing the records.
                - record_ids (List[int]): Record IDs to delete (up to 100 at a time).

        Returns:
            str: JSON object on success:
                {
                    "numberDeleted": int
                }

                Error: "<message>" on failure.

        Examples:
            - Use when: "Delete ticket #99 from the Issues table"
              → params with table_id="bqxyz.1", record_ids=[99]
        """
        try:
            body = {
                "from": params.table_id,
                "where": "{3}.EX." + ".OR.{3}.EX.".join(str(rid) for rid in params.record_ids),
            }
            data = await qb_request("DELETE", "/records", json=body)
            return json.dumps({"numberDeleted": data.get("numberDeleted", 0)}, indent=2)
        except Exception as e:
            return handle_api_error(e)
