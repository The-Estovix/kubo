import httpx
from fastapi import APIRouter, Request

from app.core.config import SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL
from app.schemas.auth import LoginRequest, SignupRequest
from app.services.supabase_rest import _send_request

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _headers(request: Request) -> dict[str, str]:
  headers = {
    "apikey": SUPABASE_PUBLISHABLE_KEY,
    "Content-Type": "application/json",
  }
  auth = request.headers.get("authorization")
  if auth:
    headers["authorization"] = auth
  return headers


@router.post("/login")
async def login(request: Request, body: LoginRequest) -> dict:
  async with httpx.AsyncClient(timeout=45.0) as client:
    response = await _send_request(
      client.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers=_headers(request),
        json={"email": body.email, "password": body.password},
      )
    )
  return response.json()


@router.post("/signup")
async def signup(request: Request, body: SignupRequest) -> dict:
  async with httpx.AsyncClient(timeout=45.0) as client:
    response = await _send_request(
      client.post(
        f"{SUPABASE_URL}/auth/v1/signup",
        headers=_headers(request),
        json={
          "email": body.email,
          "password": body.password,
          "data": {"first_name": body.first_name, "last_name": body.last_name},
          "email_redirect_to": body.email_redirect_to,
        },
      )
    )
  return response.json()
