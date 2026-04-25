import asyncio

from fastapi import APIRouter, Request

from app.schemas.users import UpdateUserRoleRequest
from app.services.supabase_rest import delete_rows, insert_rows, select_rows

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("")
async def list_users(request: Request) -> list[dict]:
  profiles, roles = await _profiles_and_roles(request)
  return [
    {
      **p,
      "role": next((r["role"] for r in roles if r.get("user_id") == p.get("id")), None),
    }
    for p in profiles
  ]


@router.get("/role/{user_id}")
async def get_user_role(request: Request, user_id: str) -> dict:
  rows = await select_rows(request, "user_roles", "role", filters={"user_id": user_id})
  return {"role": rows[0]["role"] if rows else None}


@router.put("/role/{user_id}")
async def update_user_role(request: Request, user_id: str, body: UpdateUserRoleRequest) -> dict:
  await delete_rows(request, "user_roles", filters={"user_id": user_id})
  await insert_rows(request, "user_roles", {"user_id": user_id, "role": body.role})
  return {"ok": True}


async def _profiles_and_roles(request: Request) -> tuple[list[dict], list[dict]]:
  profiles, roles = await asyncio.gather(
    select_rows(request, "profiles", "id,first_name,last_name,email"),
    select_rows(request, "user_roles", "user_id,role"),
  )
  return profiles, roles
