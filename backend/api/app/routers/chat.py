from fastapi import APIRouter, Request

from app.schemas.chat import MarkReadRequest, SendGlobalMessageRequest, SendMessageRequest
from app.services.supabase_rest import insert_rows, select_rows, update_rows

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.get("/direct")
async def list_direct_messages(request: Request, user_id: str) -> list[dict]:
  return await select_rows(
    request,
    "chat_messages",
    "id,sender_id,recipient_id,content,read_at,created_at",
    order_by="created_at",
    ascending=True,
    extra_params=[("or", f"(sender_id.eq.{user_id},recipient_id.eq.{user_id})")],
  )


@router.post("/direct")
async def send_direct_message(request: Request, body: SendMessageRequest) -> dict:
  rows = await insert_rows(
    request,
    "chat_messages",
    {
      "sender_id": body.sender_id,
      "recipient_id": body.recipient_id,
      "content": body.content,
    },
  )
  return rows[0]


@router.patch("/direct/read")
async def mark_read(request: Request, body: MarkReadRequest) -> dict:
  if body.ids:
    await update_rows(
      request,
      "chat_messages",
      {"read_at": body.read_at},
      filters={"id": body.ids},
      returning="id",
    )
  return {"ok": True}


@router.get("/global")
async def list_global_messages(request: Request) -> list[dict]:
  return await select_rows(
    request,
    "global_messages",
    "id,sender_id,content,created_at",
    order_by="created_at",
    ascending=True,
  )


@router.post("/global")
async def send_global_message(request: Request, body: SendGlobalMessageRequest) -> dict:
  rows = await insert_rows(
    request,
    "global_messages",
    {"sender_id": body.sender_id, "content": body.content},
  )
  return rows[0]
