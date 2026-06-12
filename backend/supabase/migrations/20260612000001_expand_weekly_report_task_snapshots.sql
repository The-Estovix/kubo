ALTER TABLE public.weekly_report_task_snapshots
ADD COLUMN IF NOT EXISTS task_project_id uuid,
ADD COLUMN IF NOT EXISTS assigned_by_user_id uuid,
ADD COLUMN IF NOT EXISTS task_deadline timestamptz,
ADD COLUMN IF NOT EXISTS task_created_at timestamptz,
ADD COLUMN IF NOT EXISTS task_completed_at timestamptz;

DROP INDEX IF EXISTS idx_weekly_report_snapshots_report;
CREATE INDEX IF NOT EXISTS idx_weekly_report_snapshots_report
ON public.weekly_report_task_snapshots (weekly_report_id, activity_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_weekly_report_snapshots_one_per_task
ON public.weekly_report_task_snapshots (weekly_report_id, task_id)
WHERE task_id IS NOT NULL;
