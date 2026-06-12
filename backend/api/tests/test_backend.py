import asyncio
import os
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import HTTPException
from fastapi.testclient import TestClient

API_ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_PUBLISHABLE_KEY", "test-key")
sys.path.insert(0, str(API_ROOT))

from app.main import app
from app.services.supabase_rest import _send_request
from app.services.week_calculator import completed_project_weeks


class BackendTestCase(unittest.TestCase):
  def setUp(self) -> None:
    self.client = TestClient(app)

  def test_health_returns_ok(self) -> None:
    response = self.client.get("/health")

    self.assertEqual(response.status_code, 200)
    self.assertEqual(response.json(), {"status": "ok"})

  def test_remove_members_blocks_users_with_assigned_tasks(self) -> None:
    with (
      patch("app.routers.project_members.select_rows", new=AsyncMock(return_value=[{"assignee_id": "user-1"}])),
      patch("app.routers.project_members.delete_rows", new=AsyncMock()) as delete_rows,
    ):
      response = self.client.delete("/api/project-members/bulk?project_id=proj-1&user_ids=user-1,user-2")

    self.assertEqual(response.status_code, 409)
    self.assertEqual(
      response.json(),
      {
        "detail": {
          "message": "Reassign or complete assigned tasks before removing project members.",
          "user_ids": ["user-1"],
        }
      },
    )
    delete_rows.assert_not_awaited()

  def test_remove_members_deletes_each_requested_user_when_clear(self) -> None:
    delete_rows = AsyncMock()
    with (
      patch("app.routers.project_members.select_rows", new=AsyncMock(return_value=[])),
      patch("app.routers.project_members.delete_rows", new=delete_rows),
    ):
      response = self.client.delete("/api/project-members/bulk?project_id=proj-1&user_ids=user-1,user-2")

    self.assertEqual(response.status_code, 200)
    self.assertEqual(response.json(), {"ok": True})
    delete_rows.assert_awaited_once_with(
      unittest.mock.ANY,
      "project_members",
      filters={"project_id": "proj-1", "user_id": ["user-1", "user-2"]},
    )

  def test_send_request_maps_timeout_to_gateway_timeout(self) -> None:
    async def raise_timeout():
      raise httpx.ReadTimeout("timed out")

    with self.assertRaises(HTTPException) as exc_info:
      asyncio.run(_send_request(raise_timeout()))

    self.assertEqual(exc_info.exception.status_code, 504)
    self.assertEqual(exc_info.exception.detail, "Upstream service timed out.")

  def test_update_profile_returns_updated_profile(self) -> None:
    with patch(
      "app.routers.profiles.update_rows",
      new=AsyncMock(return_value=[{
        "id": "user-1",
        "first_name": "Ava",
        "last_name": "Stone",
        "email": "ava@example.com",
      }]),
    ) as update_rows:
      response = self.client.put(
        "/api/profiles/user-1",
        json={"first_name": "Ava", "last_name": "Stone"},
      )

    self.assertEqual(response.status_code, 200)
    self.assertEqual(
      response.json(),
      {
        "id": "user-1",
        "first_name": "Ava",
        "last_name": "Stone",
        "email": "ava@example.com",
      },
    )
    update_rows.assert_awaited_once_with(
      unittest.mock.ANY,
      "profiles",
      {"first_name": "Ava", "last_name": "Stone"},
      filters={"id": "user-1"},
      returning="id,first_name,last_name,email",
    )

  def test_completed_project_weeks_are_based_on_project_creation_date(self) -> None:
    created_at = datetime(2026, 1, 1, 9, 30, tzinfo=timezone.utc)
    now = datetime(2026, 1, 15, 9, 30, tzinfo=timezone.utc)

    weeks = completed_project_weeks(created_at, now)

    self.assertEqual([week.week_number for week in weeks], [1, 2])
    self.assertEqual(weeks[0].start, datetime(2026, 1, 1, 9, 30, tzinfo=timezone.utc))
    self.assertEqual(weeks[0].next_start, datetime(2026, 1, 8, 9, 30, tzinfo=timezone.utc))
    self.assertEqual(weeks[1].start, datetime(2026, 1, 8, 9, 30, tzinfo=timezone.utc))
    self.assertEqual(weeks[1].next_start, datetime(2026, 1, 15, 9, 30, tzinfo=timezone.utc))


if __name__ == "__main__":
  unittest.main()
