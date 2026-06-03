from fastapi import APIRouter, Request

from app.schemas.tasks import CreateTaskRequest, UpdateTaskRequest
from app.services.supabase_rest import delete_rows, insert_rows, select_rows, update_rows

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("")
async def list_tasks(
  request: Request,
  project_id: str | None = None,
  assignee_id: str | None = None,
  statuses: str | None = None,
) -> list[dict]:
  filters: dict[str, str] = {}
  if project_id:
    filters["project_id"] = project_id
  if assignee_id:
    filters["assignee_id"] = assignee_id

  rows = await select_rows(
    request,
    "tasks",
    "id,title,status,assignee_id,assigned_by,project_id,deadline,projects(name)",
    filters=filters or None,
    order_by="created_at",
    ascending=True,
  )
  if statuses:
    allowed = set([s for s in statuses.split(",") if s])
    rows = [r for r in rows if r.get("status") in allowed]
  return rows


@router.post("")
async def create_task(request: Request, body: CreateTaskRequest) -> dict:
  rows = await insert_rows(
    request,
    "tasks",
    {
      "title": body.title,
      "project_id": body.project_id,
      "assignee_id": body.assignee_id,
      "assigned_by": body.assigned_by,
      "deadline": body.deadline,
    },
    returning="id",
  )
  return rows[0]


@router.patch("/{task_id}")
async def update_task(request: Request, task_id: str, body: UpdateTaskRequest) -> dict:
  await update_rows(
    request,
    "tasks",
    body.patch,
    filters={"id": task_id},
  )
  return {"ok": True}


@router.delete("/{task_id}")
async def delete_task(request: Request, task_id: str) -> dict:
  await delete_rows(
    request,
    "tasks",
    filters={"id": task_id},
  )
  return {"ok": True}
