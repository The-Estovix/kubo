from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import FRONTEND_ORIGIN
from app.routers import auth, chat, profiles, project_members, projects, reminders, tasks, users


@asynccontextmanager
async def lifespan(app: FastAPI):
  app.state.supabase_client = httpx.AsyncClient(timeout=45.0)
  try:
    yield
  finally:
    await app.state.supabase_client.aclose()


app = FastAPI(title="TeamConnect Backend API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
  CORSMiddleware,
  allow_origins=[
    FRONTEND_ORIGIN,
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://127.0.0.1:8081",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

@app.get("/health")
async def health() -> dict[str, str]:
  return {"status": "ok"}


app.include_router(profiles.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(projects.router)
app.include_router(project_members.router)
app.include_router(tasks.router)
app.include_router(chat.router)
app.include_router(reminders.router)
