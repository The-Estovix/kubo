from fastapi import APIRouter, HTTPException, Request

from app.schemas.profiles import UpdateProfileRequest
from app.services.supabase_rest import select_rows
from app.services.supabase_rest import update_rows

router = APIRouter(prefix="/api/profiles", tags=["profiles"])


@router.get("")
async def list_profiles(request: Request, exclude_id: str | None = None) -> list[dict]:
  rows = await select_rows(
    request,
    "profiles",
    "id,first_name,last_name,email",
  )
  if not exclude_id:
    return rows
  return [row for row in rows if row.get("id") != exclude_id]


@router.get("/{user_id}")
async def get_profile(request: Request, user_id: str) -> dict | None:
  rows = await select_rows(
    request,
    "profiles",
    "id,first_name,last_name,email",
    filters={"id": user_id},
  )
  return rows[0] if rows else None


@router.put("/{user_id}")
async def update_profile(request: Request, user_id: str, body: UpdateProfileRequest) -> dict:
  rows = await update_rows(
    request,
    "profiles",
    {"first_name": body.first_name, "last_name": body.last_name},
    filters={"id": user_id},
    returning="id,first_name,last_name,email",
  )
  if not rows:
    raise HTTPException(status_code=404, detail="Profile not found.")
  return rows[0]
