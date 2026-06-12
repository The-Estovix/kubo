# Kubo

Kubo has two separate apps:

- `frontend/` - React + Vite app
- `backend/api/` - FastAPI backend

Run the frontend and backend in two separate terminals.

## Requirements

- Node.js and npm
- Python 3.11 or newer
- Supabase project URL and publishable/anon key

## Environment Files

Create `backend/api/.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
FRONTEND_ORIGIN=http://localhost:8080
WEEKLY_REPORT_SCHEDULER_INTERVAL_SECONDS=3600
```

Create `frontend/.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_BACKEND_API_URL=http://127.0.0.1:8000
```

`SUPABASE_SERVICE_ROLE_KEY` is required for the automatic weekly report scheduler because it writes report snapshots in the background.

## Install Dependencies

From the repo root:

```bash
npm install --prefix frontend
```

On Windows PowerShell, if `npm` is blocked by execution policy, use:

```powershell
npm.cmd install --prefix frontend
```

Then install backend dependencies.

On Windows PowerShell:

```powershell
python -m venv backend/api/.venv
backend/api/.venv/Scripts/Activate.ps1
pip install -r backend/api/requirements.txt
```

On macOS/Linux:

```bash
python3 -m venv backend/api/.venv
source backend/api/.venv/bin/activate
pip install -r backend/api/requirements.txt
```

## Run The Backend

From the repo root, with the Python virtual environment activated:

```bash
npm run dev:backend
```

On Windows PowerShell, if `npm` gives an execution policy error, run:

```powershell
npm.cmd run dev:backend
```

You can also run the backend directly without npm:

```bash
python -m uvicorn app.main:app --app-dir backend/api --reload --host 0.0.0.0 --port 8000
```

Important: the command above must be run from the repo root:

```text
C:\Users\anuvr\Desktop\Kubo\kubo
```

If you are inside the `backend` folder instead:

```text
C:\Users\anuvr\Desktop\Kubo\kubo\backend
```

run:

```powershell
python -m uvicorn app.main:app --app-dir api --reload --host 0.0.0.0 --port 8000
```

If you are inside the `backend/api` folder instead:

```text
C:\Users\anuvr\Desktop\Kubo\kubo\backend\api
```

run:

```powershell
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The backend runs at:

```text
http://127.0.0.1:8000
```

## Run The Frontend

Open a second terminal and run this from the repo root:

```bash
npm run dev:frontend
```

On Windows PowerShell, if `npm` gives an execution policy error, run:

```powershell
npm.cmd run dev:frontend
```

The frontend runs at:

```text
http://localhost:8080
```

## Quick Start

Terminal 1:

```bash
npm run dev:backend
```

Terminal 2:

```bash
npm run dev:frontend
```

On Windows PowerShell, use `npm.cmd` instead of `npm` if scripts are blocked:

```powershell
npm.cmd run dev:backend
npm.cmd run dev:frontend
```

Then open:

```text
http://localhost:8080
```

## Build Frontend

```bash
npm run build
```

On Windows PowerShell, if needed:

```powershell
npm.cmd run build
```

## Common Backend Errors

If PowerShell shows this error:

```text
npm.ps1 cannot be loaded because running scripts is disabled on this system
```

Use `npm.cmd` instead of `npm`, for example:

```powershell
npm.cmd run dev:backend
```

If `uvicorn` is not recognized, use the project script after this update or run:

```bash
python -m uvicorn app.main:app --app-dir backend/api --reload --host 0.0.0.0 --port 8000
```

## Weekly Project Activity Reports

The backend generates immutable weekly project reports for active projects.

- Week 1 starts on the project `created_at` date.
- Each next week starts 7 days after the previous project-relative week.
- Reports are generated only after a week has ended so pending counts are historically accurate.
- Duplicate reports are prevented by a unique `(project_id, week_number)` database constraint.
- Report task snapshots store task title, assigned user, status, and activity type so old reports do not change when tasks are edited later.

Run the Supabase migration:

```text
backend/supabase/migrations/20260612000000_weekly_project_reports.sql
```

New backend APIs:

```http
GET /api/projects/{projectId}/weekly-reports
GET /api/projects/{projectId}/weekly-reports/{reportId}
```

Sample list response:

```json
[
  {
    "id": "report-id",
    "project_id": "project-id",
    "week_number": 1,
    "week_start_date": "2026-01-01T00:00:00+00:00",
    "week_end_date": "2026-01-07T23:59:59.999999+00:00",
    "total_tasks_created": 4,
    "total_tasks_completed": 2,
    "total_pending_tasks": 3,
    "generated_at": "2026-01-08T01:00:00+00:00"
  }
]
```

Sample detail response:

```json
{
  "id": "report-id",
  "project_id": "project-id",
  "week_number": 1,
  "week_start_date": "2026-01-01T00:00:00+00:00",
  "week_end_date": "2026-01-07T23:59:59.999999+00:00",
  "total_tasks_created": 1,
  "total_tasks_completed": 1,
  "total_pending_tasks": 1,
  "generated_at": "2026-01-08T01:00:00+00:00",
  "created_tasks": [
    {
      "id": "snapshot-id",
      "task_id": "task-id",
      "task_title": "Design dashboard",
      "assigned_user_id": "user-id",
      "assigned_user_name": "alex",
      "task_status": "ACTIVE",
      "activity_type": "CREATED"
    }
  ],
  "completed_tasks": [],
  "pending_tasks": []
}
```

If you see this error:

```text
ModuleNotFoundError: No module named 'app'
```

it means the command is being run from the wrong folder for the `--app-dir` path. Use one of the folder-specific commands in the backend section above.
