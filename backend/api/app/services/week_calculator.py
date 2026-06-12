from dataclasses import dataclass
from datetime import datetime, timedelta, timezone


@dataclass(frozen=True)
class ProjectWeek:
  week_number: int
  start: datetime
  end: datetime
  next_start: datetime


def parse_datetime(value: str) -> datetime:
  normalized = value.replace("Z", "+00:00")
  parsed = datetime.fromisoformat(normalized)
  if parsed.tzinfo is None:
    return parsed.replace(tzinfo=timezone.utc)
  return parsed.astimezone(timezone.utc)


def project_week_for_number(project_created_at: datetime, week_number: int) -> ProjectWeek:
  if week_number < 1:
    raise ValueError("week_number must be greater than zero")
  start = project_created_at + timedelta(days=7 * (week_number - 1))
  next_start = start + timedelta(days=7)
  return ProjectWeek(
    week_number=week_number,
    start=start,
    end=next_start - timedelta(microseconds=1),
    next_start=next_start,
  )


def completed_project_weeks(project_created_at: datetime, now: datetime | None = None) -> list[ProjectWeek]:
  current = now or datetime.now(timezone.utc)
  if current.tzinfo is None:
    current = current.replace(tzinfo=timezone.utc)
  current = current.astimezone(timezone.utc)
  created = project_created_at.astimezone(timezone.utc)

  weeks: list[ProjectWeek] = []
  week_number = 1
  while True:
    week = project_week_for_number(created, week_number)
    if week.next_start > current:
      return weeks
    weeks.append(week)
    week_number += 1
