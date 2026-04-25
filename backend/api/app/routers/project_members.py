from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.services.supabase_rest import delete_rows, insert_rows, select_rows

router = APIRouter(prefix="/api/project-members", tags=["project-members"])


class BulkMembersRequest(BaseModel):
  project_id: str
  user_ids: list[str]


@router.get("")
async def list_project_members(request: Request, project_id: str | None = None, user_id: str | None = None) -> list[dict]:
  filters: dict[str, str] = {}
  if project_id:
    filters["project_id"] = project_id
  if user_id:
    filters["user_id"] = user_id
  return await select_rows(
    request,
    "project_members",
    "project_id,user_id",
    filters=filters or None,
  )


@router.post("/bulk")
async def add_members_bulk(request: Request, body: BulkMembersRequest) -> dict:
  rows = [{"project_id": body.project_id, "user_id": uid} for uid in body.user_ids]
  if rows:
    await insert_rows(request, "project_members", rows)
  return {"ok": True}


@router.delete("/bulk")
async def remove_members_bulk(request: Request, project_id: str, user_ids: str) -> dict:
  ids = [item for item in user_ids.split(",") if item]
  if not ids:
    return {"ok": True}

  assigned_tasks = await select_rows(
    request,
    "tasks",
    "id,assignee_id",
    filters={"project_id": project_id, "assignee_id": ids},
  )
  blocked_user_ids = sorted({task["assignee_id"] for task in assigned_tasks if task.get("assignee_id")})
  if blocked_user_ids:
    raise HTTPException(
      status_code=409,
      detail={
        "message": "Reassign or complete assigned tasks before removing project members.",
        "user_ids": blocked_user_ids,
      },
    )

  await delete_rows(request, "project_members", filters={"project_id": project_id, "user_id": ids})
  return {"ok": True}
