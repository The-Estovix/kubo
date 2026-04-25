create table public.global_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.global_messages enable row level security;

create policy "global readable by authenticated"
  on public.global_messages for select
  to authenticated
  using (true);

create policy "users send global messages"
  on public.global_messages for insert
  to authenticated
  with check (sender_id = auth.uid());

alter publication supabase_realtime add table public.global_messages;