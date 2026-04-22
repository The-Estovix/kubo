-- 1. Add description to projects (nullable first, backfill, then enforce)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS description text;
UPDATE public.projects SET description = '' WHERE description IS NULL;
ALTER TABLE public.projects ALTER COLUMN description SET NOT NULL;
ALTER TABLE public.projects ALTER COLUMN description SET DEFAULT '';

-- 2. project_members table
CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members readable by authenticated"
  ON public.project_members FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins add members"
  ON public.project_members FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins remove members"
  ON public.project_members FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. Helper to check membership
CREATE OR REPLACE FUNCTION public.is_project_member(_project_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = _project_id AND user_id = _user_id
  )
$$;

-- 4. Trigger to enforce that task.assignee_id is a project member
CREATE OR REPLACE FUNCTION public.enforce_task_assignee_membership()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.assignee_id IS NOT NULL THEN
    IF NOT public.is_project_member(NEW.project_id, NEW.assignee_id) THEN
      RAISE EXCEPTION 'Assignee is not a member of this project';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_assignee_membership ON public.tasks;
CREATE TRIGGER trg_task_assignee_membership
BEFORE INSERT OR UPDATE OF assignee_id, project_id ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.enforce_task_assignee_membership();