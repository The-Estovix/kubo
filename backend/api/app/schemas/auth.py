from pydantic import BaseModel


class LoginRequest(BaseModel):
  email: str
  password: str


class SignupRequest(BaseModel):
  email: str
  password: str
  first_name: str
  last_name: str
  email_redirect_to: str
