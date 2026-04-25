-- Wipe all users and related data for a fresh start
DELETE FROM public.tasks;
DELETE FROM public.projects;
DELETE FROM public.user_roles;
DELETE FROM public.profiles;
DELETE FROM auth.users;

-- Allow admins to delete user_roles entries (for demote)
-- Already covered by "admins manage roles" ALL policy.

-- Create chat_messages table for global chat
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  content text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_pair ON public.chat_messages (sender_id, recipient_id, created_at);
CREATE INDEX idx_chat_recipient ON public.chat_messages (recipient_id, read_at);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own messages"
  ON public.chat_messages FOR SELECT
  TO authenticated
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "users send messages"
  ON public.chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "recipient marks read"
  ON public.chat_messages FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;