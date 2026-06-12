from typing import Literal

from pydantic import BaseModel

ActivityType = Literal["CREATED", "COMPLETED", "PENDING"]


class WeeklyReportTaskSnapshotDto(BaseModel):
  id: str
  task_id: str | None = None
  task_title: str
  assigned_user_id: str | None = None
  assigned_user_name: str | None = None
  task_status: str
  activity_type: ActivityType
  task_project_id: str | None = None
  assigned_by_user_id: str | None = None
  task_deadline: str | None = None
  task_created_at: str | None = None
  task_completed_at: str | None = None


class WeeklyReportSummaryDto(BaseModel):
  id: str
  project_id: str
  week_number: int
  week_start_date: str
  week_end_date: str
  total_tasks_created: int
  total_tasks_completed: int
  total_pending_tasks: int
  generated_at: str


class WeeklyReportDetailDto(WeeklyReportSummaryDto):
  created_tasks: list[WeeklyReportTaskSnapshotDto]
  completed_tasks: list[WeeklyReportTaskSnapshotDto]
  pending_tasks: list[WeeklyReportTaskSnapshotDto]
