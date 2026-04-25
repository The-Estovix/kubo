from pydantic import BaseModel


class SendMessageRequest(BaseModel):
  sender_id: str
  recipient_id: str
  content: str


class SendGlobalMessageRequest(BaseModel):
  sender_id: str
  content: str


class MarkReadRequest(BaseModel):
  ids: list[str]
  read_at: str
