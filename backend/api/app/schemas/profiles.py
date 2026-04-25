from pydantic import BaseModel, field_validator


class UpdateProfileRequest(BaseModel):
  first_name: str
  last_name: str

  @field_validator("first_name", "last_name")
  @classmethod
  def validate_non_empty_name(cls, value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
      raise ValueError("Name fields cannot be empty.")
    return cleaned
