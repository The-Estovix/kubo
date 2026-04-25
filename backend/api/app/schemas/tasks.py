from typing import Any

from pydantic import BaseModel


class UpdateTaskRequest(BaseModel):
  patch: dict[str, Any]


class CreateTaskRequest(BaseModel):
  title: str
  project_id: str
  assignee_id: str | None = None
  assigned_by: str
  deadline: str | None = None
