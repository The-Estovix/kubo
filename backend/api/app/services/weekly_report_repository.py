from typing import Any

import httpx
from fastapi import Request

from app.services.supabase_rest import (
  build_system_headers,
  insert_rows_with_client,
  select_rows,
  select_rows_with_client,
)


REPORT_SELECT = (
  "id,project_id,week_number,week_start_date,week_end_date,"
  "total_tasks_created,total_tasks_completed,total_pending_tasks,generated_at"
)

SNAPSHOT_SELECT = (
  "id,weekly_report_id,task_id,task_title,assigned_user_id,assigned_user_name,"
  "task_status,activity_type,task_project_id,assigned_by_user_id,task_deadline,"
  "task_created_at,task_completed_at"
)

TASK_SELECT = (
  "id,title,status,assignee_id,assignee_username,assigned_by,project_id,deadline,created_at,completed_at"
)


class WeeklyReportReadRepository:
  def __init__(self, request: Request):
    self.request = request

  async def list_reports(self, project_id: str) -> list[dict[str, Any]]:
    return await select_rows(
      self.request,
      "weekly_reports",
      REPORT_SELECT,
      filters={"project_id": project_id},
      order_by="week_number",
      ascending=True,
    )

  async def get_report(self, project_id: str, report_id: str) -> dict[str, Any] | None:
    rows = await select_rows(
      self.request,
      "weekly_reports",
      REPORT_SELECT,
      filters={"id": report_id, "project_id": project_id},
    )
    return rows[0] if rows else None

  async def list_snapshots(self, report_id: str) -> list[dict[str, Any]]:
    return await select_rows(
      self.request,
      "weekly_report_task_snapshots",
      SNAPSHOT_SELECT,
      filters={"weekly_report_id": report_id},
      order_by="activity_type",
      ascending=True,
    )


class WeeklyReportSystemRepository:
  def __init__(self, client: httpx.AsyncClient):
    self.client = client
    self.headers = build_system_headers()

  async def list_active_projects(self) -> list[dict[str, Any]]:
    return await select_rows_with_client(
      self.client,
      "projects",
      "id,created_at,status",
      headers=self.headers,
      filters={"status": "ACTIVE"},
      order_by="created_at",
      ascending=True,
    )

  async def report_exists(self, project_id: str, week_number: int) -> bool:
    rows = await select_rows_with_client(
      self.client,
      "weekly_reports",
      "id",
      headers=self.headers,
      filters={"project_id": project_id, "week_number": week_number},
    )
    return bool(rows)

  async def create_report(self, payload: dict[str, Any]) -> dict[str, Any]:
    rows = await insert_rows_with_client(
      self.client,
      "weekly_reports",
      payload,
      headers=self.headers,
      returning="id",
    )
    return rows[0]

  async def create_snapshots(self, payload: list[dict[str, Any]]) -> None:
    if not payload:
      return
    await insert_rows_with_client(
      self.client,
      "weekly_report_task_snapshots",
      payload,
      headers=self.headers,
      returning="id",
    )

  async def list_tasks_created_between(self, project_id: str, start_iso: str, next_start_iso: str) -> list[dict[str, Any]]:
    return await select_rows_with_client(
      self.client,
      "tasks",
      TASK_SELECT,
      headers=self.headers,
      filters={"project_id": project_id},
      order_by="created_at",
      ascending=True,
      extra_params=[("created_at", f"gte.{start_iso}"), ("created_at", f"lt.{next_start_iso}")],
    )

  async def list_tasks_completed_between(self, project_id: str, start_iso: str, next_start_iso: str) -> list[dict[str, Any]]:
    return await select_rows_with_client(
      self.client,
      "tasks",
      TASK_SELECT,
      headers=self.headers,
      filters={"project_id": project_id},
      order_by="completed_at",
      ascending=True,
      extra_params=[("completed_at", f"gte.{start_iso}"), ("completed_at", f"lt.{next_start_iso}")],
    )

  async def list_tasks_pending_at_end(self, project_id: str, next_start_iso: str) -> list[dict[str, Any]]:
    return await select_rows_with_client(
      self.client,
      "tasks",
      TASK_SELECT,
      headers=self.headers,
      filters={"project_id": project_id},
      order_by="created_at",
      ascending=True,
      extra_params=[
        ("created_at", f"lt.{next_start_iso}"),
        ("or", f"(completed_at.is.null,completed_at.gte.{next_start_iso})"),
      ],
    )
