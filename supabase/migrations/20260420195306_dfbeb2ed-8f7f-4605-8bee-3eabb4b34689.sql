-- Enums
create type public.app_role as enum ('admin', 'employee');
create type public.task_status as enum ('UNASSIGNED', 'NOT_STARTED', 'ACTIVE', 'COMPLETED');
create type public.project_status as enum ('ACTIVE', 'ARCHIVED');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles readable by authenticated"
on public.profiles for select to authenticated using (true);

create policy "users update own profile"
on public.profiles for update to authenticated
using (auth.uid() = id);

-- User roles (separate table — never on profile)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "roles readable by authenticated"
on public.user_roles for select to authenticated using (true);

create policy "admins manage roles"
on public.user_roles for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

-- Signup trigger: create profile + grant admin to first user else employee
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _is_first boolean;
begin
  insert into public.profiles (id, first_name, last_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    new.email
  );

  select not exists (select 1 from public.user_roles) into _is_first;
  insert into public.user_roles (user_id, role)
  values (new.id, case when _is_first then 'admin'::app_role else 'employee'::app_role end);

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Projects
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status project_status not null default 'ACTIVE',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.projects enable row level security;

create policy "projects readable by authenticated"
on public.projects for select to authenticated using (true);

create policy "admins create projects"
on public.projects for insert to authenticated
with check (public.has_role(auth.uid(), 'admin') and created_by = auth.uid());

create policy "admins update projects"
on public.projects for update to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy "admins delete projects"
on public.projects for delete to authenticated
using (public.has_role(auth.uid(), 'admin'));

-- Tasks
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status task_status not null default 'UNASSIGNED',
  assignee_id uuid references auth.users(id),
  project_id uuid not null references public.projects(id) on delete cascade,
  assigned_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.tasks (project_id);
create index on public.tasks (assignee_id);
alter table public.tasks enable row level security;

create policy "tasks readable by authenticated"
on public.tasks for select to authenticated using (true);

create policy "admins insert tasks"
on public.tasks for insert to authenticated
with check (public.has_role(auth.uid(), 'admin') and assigned_by = auth.uid());

-- Update policy: admins can do anything; assignees can only transition their own task
create policy "task updates"
on public.tasks for update to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or assignee_id = auth.uid()
);

create policy "admins delete tasks"
on public.tasks for delete to authenticated
using (public.has_role(auth.uid(), 'admin'));

-- Enforce status transitions and lock COMPLETED
create or replace function public.enforce_task_transition()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _is_admin boolean := public.has_role(auth.uid(), 'admin');
begin
  new.updated_at := now();

  -- COMPLETED is terminal
  if old.status = 'COMPLETED' then
    raise exception 'Task is completed and locked';
  end if;

  -- Auto-derive status from assignee changes when admin assigns/reassigns
  if new.status = old.status and new.assignee_id is distinct from old.assignee_id then
    if not _is_admin then
      raise exception 'Only admins can reassign';
    end if;
    if new.assignee_id is null then
      new.status := 'UNASSIGNED';
    elsif old.status = 'UNASSIGNED' then
      new.status := 'NOT_STARTED';
    end if;
    new.assigned_by := auth.uid();
    return new;
  end if;

  -- Status transitions
  if new.status <> old.status then
    if new.status = 'NOT_STARTED' and old.status = 'UNASSIGNED' then
      if not _is_admin then raise exception 'Only admins can assign'; end if;
      if new.assignee_id is null then raise exception 'Assignee required'; end if;
      new.assigned_by := auth.uid();
    elsif new.status = 'ACTIVE' and old.status = 'NOT_STARTED' then
      if new.assignee_id is null or new.assignee_id <> auth.uid() then
        raise exception 'Only the assignee can start this task';
      end if;
    elsif new.status = 'COMPLETED' and old.status = 'ACTIVE' then
      if new.assignee_id is null or new.assignee_id <> auth.uid() then
        raise exception 'Only the assignee can complete this task';
      end if;
    else
      raise exception 'Invalid status transition: % -> %', old.status, new.status;
    end if;
  end if;

  return new;
end;
$$;

create trigger tasks_enforce_transition
before update on public.tasks
for each row execute function public.enforce_task_transition();

-- Insert trigger: derive status from assignee
create or replace function public.set_task_initial_status()
returns trigger language plpgsql as $$
begin
  if new.assignee_id is null then
    new.status := 'UNASSIGNED';
  else
    new.status := 'NOT_STARTED';
  end if;
  return new;
end;
$$;

create trigger tasks_set_initial_status
before insert on public.tasks
for each row execute function public.set_task_initial_status();