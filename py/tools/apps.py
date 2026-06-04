"""
Quickbase app-level tools.

Tools:
  - qb_list_apps  (P0) — list all apps accessible to the authenticated user
"""

import json
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict
from mcp.server.fastmcp import FastMCP

from client import qb_request, handle_api_error


def register_app_tools(mcp: FastMCP) -> None:
    """Register all app-level tools onto the FastMCP server instance."""

    class ListAppsInput(BaseModel):
        """Input model for listing Quickbase apps."""

        model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

        user_token_only: Optional[bool] = Field(
            default=False,
            description=(
                "If True, return only apps owned by the authenticated user. "
                "If False (default), return all apps the user can access."
            ),
        )

    @mcp.tool(
        name="qb_list_apps",
        annotations={
            "title": "List Quickbase Apps",
            "readOnlyHint": True,
            "destructiveHint": False,
            "idempotentHint": True,
            "openWorldHint": True,
        },
    )
    async def qb_list_apps(params: ListAppsInput) -> str:
        """
        List all Quickbase apps accessible to the authenticated user.

        Returns the app ID and name for each app. Use these IDs with other
        tools (e.g. qb_list_tables, qb_query_records) to explore an app's data.

        Args:
            params (ListAppsInput):
                - user_token_only (bool): Limit results to apps owned by this user token.

        Returns:
            str: JSON array of app objects:
                [
                    {
                        "id": str,          # App ID (e.g. "bqxyz1234")
                        "name": str,        # App display name
                        "description": str, # App description (may be empty)
                        "created": str,     # ISO-8601 creation timestamp
                        "updated": str      # ISO-8601 last-updated timestamp
                    },
                    ...
                ]

                Error: "<message>" on failure.

        Examples:
            - Use when: You need to discover which Quickbase apps are available before querying records.
            - Don't use when: You already know your app ID.
        """
        try:
            data = await qb_request(
                "GET",
                "/apps",
                params={"userTokenOnly": str(params.user_token_only).lower()},
            )
            apps = data if isinstance(data, list) else data.get("apps", [])
            result = [
                {
                    "id": app.get("id"),
                    "name": app.get("name"),
                    "description": app.get("description", ""),
                    "created": app.get("created"),
                    "updated": app.get("updated"),
                }
                for app in apps
            ]
            return json.dumps(result, indent=2)
        except Exception as e:
            return handle_api_error(e)
