from pydantic import BaseModel


class CreateProjectRequest(BaseModel):
  name: str
  description: str
  created_by: str
  deadline: str | None = None
  member_ids: list[str]


class UpdateProjectRequest(BaseModel):
  deadline: str | None = None
