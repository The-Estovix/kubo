import asyncio
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Request

from app.services.supabase_rest import select_rows

router = APIRouter(prefix="/api/reminders", tags=["reminders"])


@router.get("")
async def get_reminders(request: Request, user_id: str) -> list[dict]:
  cutoff_iso = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()

  memberships, my_tasks = await asyncio.gather(
    select_rows(
      request,
      "project_members",
      "project_id",
      filters={"user_id": user_id},
    ),
    select_rows(
      request,
      "tasks",
      "id,title,deadline,project_id,projects(name),status,assignee_id",
      filters={"assignee_id": user_id},
    ),
  )

  project_ids = [m["project_id"] for m in memberships]
  projects: list[dict] = []
  if project_ids:
    projects = await select_rows(
      request,
      "projects",
      "id,name,deadline",
      filters={"id": project_ids},
    )

  items: list[dict] = []
  for p in projects:
    deadline = p.get("deadline")
    if deadline and deadline <= cutoff_iso:
      items.append({
        "kind": "project",
        "id": p["id"],
        "title": p["name"],
        "subtitle": "Project deadline",
        "deadline": deadline,
        "projectId": p["id"],
      })

  for t in my_tasks:
    deadline = t.get("deadline")
    status = t.get("status")
    if not deadline or status not in ("NOT_STARTED", "ACTIVE"):
      continue
    if deadline > cutoff_iso:
      continue
    items.append({
      "kind": "task",
      "id": t["id"],
      "title": t["title"],
      "subtitle": (t.get("projects") or {}).get("name", "Task"),
      "deadline": deadline,
      "projectId": t["project_id"],
    })

  items.sort(key=lambda x: x["deadline"])
  return items
