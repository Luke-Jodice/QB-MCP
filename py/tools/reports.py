"""
Quickbase report tools.

Tools:
  - qb_run_report  (P1) — execute an existing Quickbase report by ID
"""

import json
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict
from mcp.server.fastmcp import FastMCP

from client import qb_request, handle_api_error
from tools.records import _format_records


def register_report_tools(mcp: FastMCP) -> None:
    """Register all report tools onto the FastMCP server instance."""

    class RunReportInput(BaseModel):
        """Input for running a saved Quickbase report."""

        model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

        table_id: str = Field(
            ...,
            description="The table ID the report belongs to.",
            min_length=1,
        )
        report_id: str = Field(
            ...,
            description="The Quickbase report ID to run.",
            min_length=1,
        )
        skip: int = Field(
            default=0,
            description="Number of records to skip for pagination.",
            ge=0,
        )
        top: Optional[int] = Field(
            default=None,
            description="Max records to return. Omit to use the report's default limit.",
            ge=1,
            le=1000,
        )

    @mcp.tool(
        name="qb_run_report",
        annotations={
            "title": "Run a Quickbase Report",
            "readOnlyHint": True,
            "destructiveHint": False,
            "idempotentHint": True,
            "openWorldHint": True,
        },
    )
    async def qb_run_report(params: RunReportInput) -> str:
        """
        Execute an existing saved Quickbase report and return its records.

        Reports are pre-defined queries in Quickbase that may include filters, sorting,
        and field selection. Use this when a stakeholder has already set up a report
        and you want to pull its data into an AI workflow.

        Args:
            params (RunReportInput):
                - table_id (str): Table the report belongs to.
                - report_id (str): ID of the saved report to run.
                - skip (int): Records to skip for pagination (default 0).
                - top (int, optional): Max records to return.

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
            - Use when: "Run the 'Open Tickets by Priority' report and summarize the results."
        """
        try:
            query_params = {"tableId": params.table_id, "skip": params.skip}
            if params.top is not None:
                query_params["top"] = params.top

            data = await qb_request(
                "POST",
                f"/reports/{params.report_id}/run",
                params=query_params,
            )

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
