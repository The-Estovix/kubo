from collections import defaultdict
from datetime import datetime, timezone
import logging

import httpx

from app.core.config import SUPABASE_SERVICE_ROLE_KEY
from app.schemas.weekly_reports import WeeklyReportDetailDto, WeeklyReportSummaryDto, WeeklyReportTaskSnapshotDto
from app.services.week_calculator import completed_project_weeks, parse_datetime
from app.services.weekly_report_repository import WeeklyReportReadRepository, WeeklyReportSystemRepository

logger = logging.getLogger(__name__)


def _iso(value: datetime) -> str:
  return value.astimezone(timezone.utc).isoformat()


def _assigned_name(task: dict) -> str | None:
  return task.get("assignee_username")


def _snapshot_payload(report_id: str, task: dict, activity_type: str) -> dict:
  return {
    "weekly_report_id": report_id,
    "task_id": task.get("id"),
    "task_title": task.get("title") or "",
    "assigned_user_id": task.get("assignee_id"),
    "assigned_user_name": _assigned_name(task),
    "task_status": task.get("status") or "UNKNOWN",
    "activity_type": activity_type,
  }


class WeeklyReportRetrievalService:
  def __init__(self, repository: WeeklyReportReadRepository):
    self.repository = repository

  async def list_project_reports(self, project_id: str) -> list[WeeklyReportSummaryDto]:
    rows = await self.repository.list_reports(project_id)
    return [WeeklyReportSummaryDto(**row) for row in rows]

  async def get_project_report(self, project_id: str, report_id: str) -> WeeklyReportDetailDto | None:
    report = await self.repository.get_report(project_id, report_id)
    if not report:
      return None

    grouped: dict[str, list[WeeklyReportTaskSnapshotDto]] = defaultdict(list)
    for row in await self.repository.list_snapshots(report_id):
      dto = WeeklyReportTaskSnapshotDto(**row)
      grouped[dto.activity_type].append(dto)

    return WeeklyReportDetailDto(
      **report,
      created_tasks=grouped["CREATED"],
      completed_tasks=grouped["COMPLETED"],
      pending_tasks=grouped["PENDING"],
    )


class WeeklyReportGenerationService:
  def __init__(self, repository: WeeklyReportSystemRepository):
    self.repository = repository

  async def generate_due_reports(self) -> int:
    generated_count = 0
    projects = await self.repository.list_active_projects()
    now = datetime.now(timezone.utc)

    for project in projects:
      project_id = project["id"]
      created_at = parse_datetime(project["created_at"])
      for week in completed_project_weeks(created_at, now):
        if await self.repository.report_exists(project_id, week.week_number):
          continue

        start_iso = _iso(week.start)
        next_start_iso = _iso(week.next_start)
        created_tasks = await self.repository.list_tasks_created_between(project_id, start_iso, next_start_iso)
        completed_tasks = await self.repository.list_tasks_completed_between(project_id, start_iso, next_start_iso)
        pending_tasks = await self.repository.list_tasks_pending_at_end(project_id, next_start_iso)

        report = await self.repository.create_report({
          "project_id": project_id,
          "week_number": week.week_number,
          "week_start_date": start_iso,
          "week_end_date": _iso(week.end),
          "total_tasks_created": len(created_tasks),
          "total_tasks_completed": len(completed_tasks),
          "total_pending_tasks": len(pending_tasks),
        })

        snapshots = [
          *[_snapshot_payload(report["id"], task, "CREATED") for task in created_tasks],
          *[_snapshot_payload(report["id"], task, "COMPLETED") for task in completed_tasks],
          *[_snapshot_payload(report["id"], task, "PENDING") for task in pending_tasks],
        ]
        await self.repository.create_snapshots(snapshots)
        generated_count += 1

    return generated_count


async def generate_weekly_reports_with_client(client: httpx.AsyncClient) -> int:
  if not SUPABASE_SERVICE_ROLE_KEY:
    logger.info("Weekly report scheduler skipped because SUPABASE_SERVICE_ROLE_KEY is not configured.")
    return 0
  service = WeeklyReportGenerationService(WeeklyReportSystemRepository(client))
  return await service.generate_due_reports()
