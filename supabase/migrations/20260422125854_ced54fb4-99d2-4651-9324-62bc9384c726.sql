-- Add deadline columns
ALTER TABLE public.projects ADD COLUMN deadline timestamptz;
ALTER TABLE public.tasks ADD COLUMN deadline timestamptz;

-- Allow admins to add/remove project members (already exists via has_role); add UPDATE policy for projects already exists.
-- Make sure project_members has admin manage already (exists).
