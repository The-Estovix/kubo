import os
from pathlib import Path

from dotenv import load_dotenv

API_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(API_ROOT / ".env")
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_PUBLISHABLE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:8081")
WEEKLY_REPORT_SCHEDULER_INTERVAL_SECONDS = int(os.getenv("WEEKLY_REPORT_SCHEDULER_INTERVAL_SECONDS", "3600"))

if not SUPABASE_URL:
  raise RuntimeError("SUPABASE_URL is required.")

if not SUPABASE_PUBLISHABLE_KEY:
  raise RuntimeError("SUPABASE_PUBLISHABLE_KEY is required.")
