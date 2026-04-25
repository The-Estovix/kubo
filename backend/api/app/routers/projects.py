from fastapi import APIRouter, Request

from app.schemas.projects import CreateProjectRequest, UpdateProjectRequest
from app.services.supabase_rest import insert_rows, select_rows, update_rows

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("")
async def list_projects(request: Request) -> list[dict]:
  return await select_rows(
    request,
    "projects",
    "id,name,description,status,created_by,deadline",
    order_by="created_at",
    ascending=False,
  )


@router.get("/{project_id}")
async def get_project(request: Request, project_id: str) -> dict | None:
  rows = await select_rows(
    request,
    "projects",
    "id,name,description,status,deadline",
    filters={"id": project_id},
  )
  return rows[0] if rows else None


@router.post("")
async def create_project(request: Request, body: CreateProjectRequest) -> dict:
  created = await insert_rows(
    request,
    "projects",
    {
      "name": body.name,
      "description": body.description,
      "created_by": body.created_by,
      "deadline": body.deadline,
    },
    returning="id",
  )
  project_id = created[0]["id"]
  members = [{"project_id": project_id, "user_id": user_id} for user_id in body.member_ids]
  if members:
    await insert_rows(request, "project_members", members)
  return {"id": project_id}


@router.patch("/{project_id}")
async def update_project(request: Request, project_id: str, body: UpdateProjectRequest) -> dict:
  await update_rows(
    request,
    "projects",
    {"deadline": body.deadline},
    filters={"id": project_id},
  )
  return {"ok": True}
