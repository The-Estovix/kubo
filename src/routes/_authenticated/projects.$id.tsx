import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { ProgressBar } from "@/components/ProgressBar";
import { StatusBadge, type TaskStatus } from "@/components/StatusBadge";
import { ArrowLeft, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/projects/$id")({
  component: ProjectDetailPage,
});

interface Profile { id: string; first_name: string; last_name: string; email: string; }
interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  assignee_id: string | null;
  assigned_by: string;
  project_id: string;
}

function ProjectDetailPage() {
  const { id } = Route.useParams();
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();

  const projectQ = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, description, status")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const membersQ = useQuery({
    queryKey: ["project-members", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_members")
        .select("user_id")
        .eq("project_id", id);
      if (error) throw error;
      return (data ?? []).map((r) => r.user_id);
    },
  });

  const tasksQ = useQuery({
    queryKey: ["tasks", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, status, assignee_id, assigned_by, project_id")
        .eq("project_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });

  const profilesQ = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, first_name, last_name, email");
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const profilesById = useMemo(() => {
    const m = new Map<string, Profile>();
    (profilesQ.data ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [profilesQ.data]);

  const tasks = tasksQ.data ?? [];
  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const pct = tasks.length === 0 ? 0 : (completed / tasks.length) * 100;

  // Mutations
  const updateTask = useMutation({
    mutationFn: async (vars: { id: string; patch: Partial<Task> }) => {
      const { error } = await supabase.from("tasks").update(vars.patch).eq("id", vars.id);
      if (error) throw error;
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["tasks", id] });
      const prev = qc.getQueryData<Task[]>(["tasks", id]);
      qc.setQueryData<Task[]>(["tasks", id], (old) =>
        (old ?? []).map((t) => (t.id === vars.id ? { ...t, ...vars.patch } : t)),
      );
      return { prev };
    },
    onError: (err: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["tasks", id], ctx.prev);
      toast.error(err.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["tasks", id] });
      qc.invalidateQueries({ queryKey: ["projects-with-progress"] });
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              {projectQ.data?.name ?? "…"}
            </h1>
            <div className="mt-1 text-sm text-muted-foreground">
              {completed} of {tasks.length} tasks complete
            </div>
          </div>
          {isAdmin && <AddTaskButton projectId={id} profiles={profilesQ.data ?? []} />}
        </div>
        <div className="mt-5 max-w-xl">
          <ProgressBar value={pct} />
          <div className="mt-1.5 text-right text-xs font-medium text-muted-foreground">{Math.round(pct)}%</div>
        </div>
      </div>

      {tasksQ.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading tasks…</div>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 py-16 text-center">
          <div className="text-sm text-muted-foreground">No tasks added</div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <ul className="divide-y divide-border">
            {tasks.map((t) => {
              const assignee = t.assignee_id ? profilesById.get(t.assignee_id) : null;
              const assigner = profilesById.get(t.assigned_by);
              const mine = t.assignee_id === user?.id;
              return (
                <li key={t.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${t.status === "COMPLETED" ? "text-muted-foreground line-through" : ""}`}>
                        {t.title}
                      </span>
                      <StatusBadge status={t.status} />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {assignee ? (
                        <>Assigned to <span className="text-foreground">{assignee.first_name}</span></>
                      ) : (
                        <>Unassigned</>
                      )}
                      {assigner && (
                        <> · by <span className="text-foreground">{assigner.first_name}</span></>
                      )}
                    </div>
                  </div>
                  <TaskActions
                    task={t}
                    isAdmin={isAdmin}
                    isMine={mine}
                    profiles={profilesQ.data ?? []}
                    onUpdate={(patch) => updateTask.mutate({ id: t.id, patch })}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function TaskActions({
  task, isAdmin, isMine, profiles, onUpdate,
}: {
  task: Task;
  isAdmin: boolean;
  isMine: boolean;
  profiles: Profile[];
  onUpdate: (patch: Partial<Task>) => void;
}) {
  const [reassignOpen, setReassignOpen] = useState(false);

  if (task.status === "COMPLETED") {
    return <span className="text-xs text-muted-foreground">Locked</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {task.status === "NOT_STARTED" && isMine && (
        <Button size="sm" onClick={() => onUpdate({ status: "ACTIVE" })}>Start</Button>
      )}
      {task.status === "ACTIVE" && isMine && (
        <Button size="sm" onClick={() => onUpdate({ status: "COMPLETED" })}>Complete</Button>
      )}
      {isAdmin && (
        <>
          <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                {task.status === "UNASSIGNED" ? "Assign" : "Reassign"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{task.status === "UNASSIGNED" ? "Assign task" : "Reassign task"}</DialogTitle>
              </DialogHeader>
              <AssigneePicker
                profiles={profiles}
                onPick={(p) => {
                  onUpdate({ assignee_id: p.id });
                  setReassignOpen(false);
                }}
              />
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

function AssigneePicker({
  profiles, onPick,
}: { profiles: Profile[]; onPick: (p: Profile) => void }) {
  const [q, setQ] = useState("");
  const filtered = profiles.filter((p) =>
    p.first_name.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          placeholder="Search by first name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="max-h-72 overflow-y-auto rounded-md border border-border">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">No matches</div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onPick(p)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-accent"
                >
                  <span className="font-medium">{p.first_name} {p.last_name}</span>
                  <span className="text-xs text-muted-foreground">{p.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AddTaskButton({ projectId, profiles }: { projectId: string; profiles: Profile[] }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("tasks").insert({
      title,
      project_id: projectId,
      assignee_id: assignee?.id ?? null,
      assigned_by: user!.id,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["tasks", projectId] });
    qc.invalidateQueries({ queryKey: ["projects-with-progress"] });
    setOpen(false);
    setTitle("");
    setAssignee(null);
    toast.success("Task added");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" /> Add task</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add task</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ttl">Title</Label>
            <Input id="ttl" required value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Assign to <span className="text-muted-foreground">(optional)</span></Label>
            {assignee ? (
              <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
                <div className="text-sm">
                  <span className="font-medium">{assignee.first_name} {assignee.last_name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{assignee.email}</span>
                </div>
                <button type="button" onClick={() => setAssignee(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <AssigneePicker profiles={profiles} onPick={setAssignee} />
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !title.trim()}>
              {busy ? "Adding…" : "Add task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
