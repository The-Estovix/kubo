-- 1. Add columns to all relevant tables
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS assignee_username text;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.global_messages ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.project_members ADD COLUMN IF NOT EXISTS username text;

-- 2. Create trigger function for Projects
CREATE OR REPLACE FUNCTION public.set_project_username() RETURNS trigger AS $$
BEGIN
  SELECT username INTO new.username FROM public.profiles WHERE id = new.created_by;
  RETURN new;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_set_project_username ON public.projects;
CREATE TRIGGER trigger_set_project_username BEFORE INSERT OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_project_username();

-- 3. Create trigger function for Tasks
CREATE OR REPLACE FUNCTION public.set_task_username() RETURNS trigger AS $$
BEGIN
  SELECT username INTO new.username FROM public.profiles WHERE id = new.assigned_by;
  IF new.assignee_id IS NOT NULL THEN
    SELECT username INTO new.assignee_username FROM public.profiles WHERE id = new.assignee_id;
  ELSE
    new.assignee_username := NULL;
  END IF;
  RETURN new;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_set_task_username ON public.tasks;
CREATE TRIGGER trigger_set_task_username BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_task_username();

-- 4. Create trigger function for Chat Messages
CREATE OR REPLACE FUNCTION public.set_chat_username() RETURNS trigger AS $$
BEGIN
  SELECT username INTO new.username FROM public.profiles WHERE id = new.sender_id;
  RETURN new;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_set_chat_username ON public.chat_messages;
CREATE TRIGGER trigger_set_chat_username BEFORE INSERT OR UPDATE ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.set_chat_username();

-- 5. Create trigger function for Global Messages
CREATE OR REPLACE FUNCTION public.set_global_username() RETURNS trigger AS $$
BEGIN
  SELECT username INTO new.username FROM public.profiles WHERE id = new.sender_id;
  RETURN new;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_set_global_username ON public.global_messages;
CREATE TRIGGER trigger_set_global_username BEFORE INSERT OR UPDATE ON public.global_messages FOR EACH ROW EXECUTE FUNCTION public.set_global_username();

-- 6. Create trigger function for Project Members
CREATE OR REPLACE FUNCTION public.set_member_username() RETURNS trigger AS $$
BEGIN
  SELECT username INTO new.username FROM public.profiles WHERE id = new.user_id;
  RETURN new;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_set_member_username ON public.project_members;
CREATE TRIGGER trigger_set_member_username BEFORE INSERT OR UPDATE ON public.project_members FOR EACH ROW EXECUTE FUNCTION public.set_member_username();

-- 7. Seed Default Admin User
DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'theestovix@gmail.com') THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_user_meta_data, created_at, updated_at, confirmation_token
    ) VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'theestovix@gmail.com',
      crypt('estovix@2026', gen_salt('bf')),
      now(),
      '{"first_name": "Admin", "last_name": "User", "username": "admin"}',
      now(),
      now(),
      ''
    );
    -- handle_new_user trigger automatically creates profile.
    -- Force role to admin to be safe:
    UPDATE public.user_roles SET role = 'admin' WHERE user_id = new_user_id;
  END IF;
END $$;
