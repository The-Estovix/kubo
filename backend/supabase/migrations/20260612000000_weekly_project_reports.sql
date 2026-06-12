ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_task_completed_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF new.status = 'COMPLETED' AND old.status <> 'COMPLETED' AND new.completed_at IS NULL THEN
    new.completed_at := now();
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS tasks_set_completed_at ON public.tasks;
CREATE TRIGGER tasks_set_completed_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.set_task_completed_at();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'weekly_report_activity_type') THEN
    CREATE TYPE public.weekly_report_activity_type AS ENUM ('CREATED', 'COMPLETED', 'PENDING');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.weekly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  week_number integer NOT NULL CHECK (week_number > 0),
  week_start_date timestamptz NOT NULL,
  week_end_date timestamptz NOT NULL,
  total_tasks_created integer NOT NULL DEFAULT 0 CHECK (total_tasks_created >= 0),
  total_tasks_completed integer NOT NULL DEFAULT 0 CHECK (total_tasks_completed >= 0),
  total_pending_tasks integer NOT NULL DEFAULT 0 CHECK (total_pending_tasks >= 0),
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, week_number)
);

CREATE INDEX IF NOT EXISTS idx_weekly_reports_project_week
ON public.weekly_reports (project_id, week_number);

ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "weekly reports readable by authenticated" ON public.weekly_reports;
CREATE POLICY "weekly reports readable by authenticated"
ON public.weekly_reports FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.weekly_report_task_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_report_id uuid NOT NULL REFERENCES public.weekly_reports(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  task_title text NOT NULL,
  assigned_user_id uuid,
  assigned_user_name text,
  task_status text NOT NULL,
  activity_type public.weekly_report_activity_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (weekly_report_id, task_id, activity_type)
);

CREATE INDEX IF NOT EXISTS idx_weekly_report_snapshots_report
ON public.weekly_report_task_snapshots (weekly_report_id, activity_type);

ALTER TABLE public.weekly_report_task_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "weekly report snapshots readable by authenticated" ON public.weekly_report_task_snapshots;
CREATE POLICY "weekly report snapshots readable by authenticated"
ON public.weekly_report_task_snapshots FOR SELECT TO authenticated USING (true);
