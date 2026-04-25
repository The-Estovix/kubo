from pydantic import BaseModel


class UpdateUserRoleRequest(BaseModel):
  role: str
