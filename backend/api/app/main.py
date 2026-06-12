from contextlib import asynccontextmanager
import asyncio
import logging

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import FRONTEND_ORIGIN, WEEKLY_REPORT_SCHEDULER_INTERVAL_SECONDS
from app.routers import auth, chat, profiles, project_members, projects, reminders, tasks, users, weekly_reports
from app.services.weekly_report_service import generate_weekly_reports_with_client

logger = logging.getLogger(__name__)


async def weekly_report_scheduler(app: FastAPI) -> None:
  while True:
    try:
      generated = await generate_weekly_reports_with_client(app.state.supabase_client)
      if generated:
        logger.info("Generated %s weekly project reports.", generated)
    except asyncio.CancelledError:
      raise
    except Exception:
      logger.exception("Weekly project report generation failed.")
    await asyncio.sleep(WEEKLY_REPORT_SCHEDULER_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
  app.state.supabase_client = httpx.AsyncClient(timeout=45.0)
  app.state.weekly_report_scheduler = asyncio.create_task(weekly_report_scheduler(app))
  try:
    yield
  finally:
    app.state.weekly_report_scheduler.cancel()
    try:
      await app.state.weekly_report_scheduler
    except asyncio.CancelledError:
      pass
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
app.include_router(weekly_reports.router)
