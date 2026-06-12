from __future__ import annotations

import logging
from typing import Any
from urllib.parse import quote

import httpx
from fastapi import HTTPException, Request

from app.core.config import SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

logger = logging.getLogger(__name__)


def _build_headers(request: Request, extra: dict[str, str] | None = None) -> dict[str, str]:
  headers: dict[str, str] = {"apikey": SUPABASE_PUBLISHABLE_KEY}
  auth = request.headers.get("authorization")
  if auth:
    headers["authorization"] = auth
  if extra:
    headers.update(extra)
  return headers


def build_system_headers(extra: dict[str, str] | None = None) -> dict[str, str]:
  if not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is required for system jobs.")
  headers: dict[str, str] = {
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
  }
  if extra:
    headers.update(extra)
  return headers


def _get_client(request: Request) -> httpx.AsyncClient:
  client = getattr(request.app.state, "supabase_client", None)
  if client is None:
    raise RuntimeError("Supabase client is not initialized.")
  return client


def _raise_for_upstream_error(response: httpx.Response) -> None:
  if response.status_code < 400:
    return
  detail: Any
  try:
    body = response.json()
    detail = body.get("message") or body.get("error_description") or body.get("error") or body
  except Exception:
    detail = response.text or "Upstream request failed"
  logger.error(
    "Supabase request failed",
    extra={
      "method": response.request.method,
      "url": str(response.request.url),
      "status_code": response.status_code,
      "detail": detail,
    },
  )
  raise HTTPException(status_code=response.status_code, detail=detail)


async def _send_request(request_coro) -> httpx.Response:
  try:
    response = await request_coro
  except httpx.TimeoutException as exc:
    logger.exception("Supabase request timed out")
    raise HTTPException(status_code=504, detail="Upstream service timed out.") from exc
  except httpx.HTTPError as exc:
    logger.exception("Supabase request transport error")
    raise HTTPException(status_code=502, detail="Upstream service is unavailable.") from exc
  _raise_for_upstream_error(response)
  return response


def _query_parts(filters: dict[str, Any]) -> list[tuple[str, str]]:
  parts: list[tuple[str, str]] = []
  for key, value in filters.items():
    if value is None:
      continue
    if isinstance(value, list):
      encoded = ",".join(quote(str(v), safe="") for v in value)
      parts.append((key, f"in.({encoded})"))
    else:
      parts.append((key, f"eq.{value}"))
  return parts


async def select_rows(
  request: Request,
  table: str,
  select: str,
  *,
  filters: dict[str, Any] | None = None,
  order_by: str | None = None,
  ascending: bool = True,
  extra_params: list[tuple[str, str]] | None = None,
) -> list[dict[str, Any]]:
  params = [("select", select)]
  if filters:
    params.extend(_query_parts(filters))
  if order_by:
    params.append(("order", f"{order_by}.{'asc' if ascending else 'desc'}"))
  if extra_params:
    params.extend(extra_params)

  response = await _send_request(
    _get_client(request).get(
      f"{SUPABASE_URL}/rest/v1/{table}",
      headers=_build_headers(request),
      params=params,
    )
  )
  return response.json()


async def select_rows_with_client(
  client: httpx.AsyncClient,
  table: str,
  select: str,
  *,
  headers: dict[str, str],
  filters: dict[str, Any] | None = None,
  order_by: str | None = None,
  ascending: bool = True,
  extra_params: list[tuple[str, str]] | None = None,
) -> list[dict[str, Any]]:
  params = [("select", select)]
  if filters:
    params.extend(_query_parts(filters))
  if order_by:
    params.append(("order", f"{order_by}.{'asc' if ascending else 'desc'}"))
  if extra_params:
    params.extend(extra_params)

  response = await _send_request(
    client.get(
      f"{SUPABASE_URL}/rest/v1/{table}",
      headers=headers,
      params=params,
    )
  )
  return response.json()


async def insert_rows(
  request: Request,
  table: str,
  payload: dict[str, Any] | list[dict[str, Any]],
  *,
  returning: str = "*",
) -> list[dict[str, Any]]:
  headers = _build_headers(request, {"Prefer": "return=representation"})
  response = await _send_request(
    _get_client(request).post(
      f"{SUPABASE_URL}/rest/v1/{table}",
      headers=headers,
      params={"select": returning},
      json=payload,
    )
  )
  return response.json()


async def insert_rows_with_client(
  client: httpx.AsyncClient,
  table: str,
  payload: dict[str, Any] | list[dict[str, Any]],
  *,
  headers: dict[str, str],
  returning: str = "*",
) -> list[dict[str, Any]]:
  request_headers = {**headers, "Prefer": "return=representation"}
  response = await _send_request(
    client.post(
      f"{SUPABASE_URL}/rest/v1/{table}",
      headers=request_headers,
      params={"select": returning},
      json=payload,
    )
  )
  return response.json()


async def update_rows(
  request: Request,
  table: str,
  payload: dict[str, Any],
  *,
  filters: dict[str, Any],
  returning: str = "*",
  extra_params: list[tuple[str, str]] | None = None,
) -> list[dict[str, Any]]:
  params = [("select", returning), *_query_parts(filters)]
  if extra_params:
    params.extend(extra_params)
  headers = _build_headers(request, {"Prefer": "return=representation"})
  response = await _send_request(
    _get_client(request).patch(
      f"{SUPABASE_URL}/rest/v1/{table}",
      headers=headers,
      params=params,
      json=payload,
    )
  )
  return response.json()


async def delete_rows(
  request: Request,
  table: str,
  *,
  filters: dict[str, Any],
  extra_params: list[tuple[str, str]] | None = None,
) -> None:
  params = _query_parts(filters)
  if extra_params:
    params.extend(extra_params)
  await _send_request(
    _get_client(request).delete(
      f"{SUPABASE_URL}/rest/v1/{table}",
      headers=_build_headers(request),
      params=params,
    )
  )
