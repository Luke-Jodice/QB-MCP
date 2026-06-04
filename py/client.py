#!/usr/bin/env python3
"""
Quickbase API client.

Handles authentication and shared HTTP request logic for all tools.
Auth uses QB-USER-TOKEN and QB-Realm-Hostname headers per the Quickbase REST API v2 spec.
"""

import os
from typing import Any, Optional
import httpx

QB_USER_TOKEN = os.environ.get("QB_USER_TOKEN", "")
QB_REALM_HOSTNAME = os.environ.get("QB_REALM_HOSTNAME", "")

if not QB_USER_TOKEN or not QB_REALM_HOSTNAME:
    raise EnvironmentError(
        "Missing required environment variables: QB_USER_TOKEN and QB_REALM_HOSTNAME must both be set. "
        "Copy .env.example to .env and fill in your credentials."
    )

API_BASE_URL = f"https://{QB_REALM_HOSTNAME}/v1"

HEADERS = {
    "QB-Realm-Hostname": QB_REALM_HOSTNAME,
    "Authorization": f"QB-USER-TOKEN {QB_USER_TOKEN}",
    "Content-Type": "application/json",
}


async def qb_request(
    method: str,
    path: str,
    *,
    params: Optional[dict] = None,
    json: Optional[Any] = None,
) -> Any:
    """
    Make an authenticated request to the Quickbase REST API v2.

    Args:
        method: HTTP method (GET, POST, DELETE, etc.)
        path:   URL path relative to /v1, e.g. "/apps/bqxyz"
        params: Query string parameters
        json:   Request body to send as JSON

    Returns:
        Parsed JSON response body.

    Raises:
        httpx.HTTPStatusError: On 4xx / 5xx responses (caller should use handle_api_error).
        httpx.TimeoutException: If the request times out.
    """
    url = f"{API_BASE_URL}{path}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.request(
            method,
            url,
            headers=HEADERS,
            params=params,
            json=json,
        )
        response.raise_for_status()
        return response.json()


def handle_api_error(e: Exception) -> str:
    """Return a clear, actionable error string from an exception."""
    if isinstance(e, httpx.HTTPStatusError):
        status = e.response.status_code
        try:
            body = e.response.json()
            message = body.get("message", e.response.text)
        except Exception:
            message = e.response.text

        if status == 400:
            return f"Error: Bad request — {message}"
        if status == 401:
            return "Error: Unauthorized — check that QB_USER_TOKEN is valid and not expired."
        if status == 403:
            return f"Error: Forbidden — you do not have permission for this resource. {message}"
        if status == 404:
            return f"Error: Not found — check that the app ID, table ID, or record ID is correct. {message}"
        if status == 429:
            return "Error: Rate limit exceeded — wait a moment before retrying."
        return f"Error: Quickbase API returned HTTP {status}: {message}"
    if isinstance(e, httpx.TimeoutException):
        return "Error: Request timed out — try again."
    return f"Error: Unexpected error ({type(e).__name__}): {e}"
