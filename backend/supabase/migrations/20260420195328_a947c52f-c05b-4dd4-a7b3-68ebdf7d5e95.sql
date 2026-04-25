create or replace function public.set_task_initial_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is null then
    new.status := 'UNASSIGNED';
  else
    new.status := 'NOT_STARTED';
  end if;
  return new;
end;
$$;