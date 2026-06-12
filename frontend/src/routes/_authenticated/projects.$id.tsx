import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ProgressBar } from "@/components/ProgressBar";
import { StatusBadge, type TaskStatus } from "@/components/StatusBadge";
import { ArrowLeft, Plus, Search, X, Check, Users, CalendarDays, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { formatDeadline, deadlineTone, deadlineLabel } from "@/lib/deadline";
import { backendApi } from "@/lib/backend-api";

export const Route = createFileRoute("/_authenticated/projects/$id")({
  component: ProjectDetailPage,
});

interface Profile { id: string; first_name: string; last_name: string; email: string; }
interface Project {
  id: string;
  name: string;
  description: string;
  deadline: string | null;
}
interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  assignee_id: string | null;
  assigned_by: string;
  project_id: string;
  deadline: string | null;
}
interface WeeklyReportSummary {
  id: string;
  project_id: string;
  week_number: number;
  week_start_date: string;
  week_end_date: string;
  total_tasks_created: number;
  total_tasks_completed: number;
  total_pending_tasks: number;
  generated_at: string;
}
interface WeeklyReportTaskSnapshot {
  id: string;
  task_id: string | null;
  task_title: string;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  task_status: string;
  activity_type: "CREATED" | "COMPLETED" | "PENDING";
}
interface WeeklyReportDetail extends WeeklyReportSummary {
  created_tasks: WeeklyReportTaskSnapshot[];
  completed_tasks: WeeklyReportTaskSnapshot[];
  pending_tasks: WeeklyReportTaskSnapshot[];
}

function ProjectDetailPage() {
  const { id } = Route.useParams();
  const { isAdmin, user, session } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const projectQ = useQuery({
    queryKey: ["project", id],
    queryFn: () => backendApi.get<Project | null>(`/api/projects/${id}`, session?.access_token),
    enabled: !!session?.access_token,
    staleTime: 30_000,
  });

  const membersQ = useQuery({
    queryKey: ["project-members", id],
    queryFn: async () => {
      const data = await backendApi.get<Array<{ user_id: string }>>(`/api/project-members?project_id=${id}`, session?.access_token);
      return (data ?? []).map((r) => r.user_id);
    },
    enabled: !!session?.access_token,
    staleTime: 30_000,
  });

  const tasksQ = useQuery({
    queryKey: ["tasks", id],
    queryFn: async () => {
      const data = await backendApi.get<Task[]>(`/api/tasks?project_id=${id}`, session?.access_token);
      return data ?? [];
    },
    enabled: !!session?.access_token,
    staleTime: 15_000,
  });

  const weeklyReportsQ = useQuery({
    queryKey: ["weekly-reports", id],
    queryFn: async () => {
      const data = await backendApi.get<WeeklyReportSummary[]>(`/api/projects/${id}/weekly-reports`, session?.access_token);
      return data ?? [];
    },
    enabled: !!session?.access_token,
    staleTime: 60_000,
  });

  const profilesQ = useQuery({
    queryKey: ["profiles"],
    queryFn: () => backendApi.get<Profile[]>("/api/profiles", session?.access_token),
    enabled: !!session?.access_token,
    staleTime: 60_000,
  });

  const profilesById = useMemo(() => {
    const m = new Map<string, Profile>();
    (profilesQ.data ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [profilesQ.data]);

  const memberProfiles = useMemo(() => {
    const ids = membersQ.data ?? [];
    return ids
      .map((uid) => profilesById.get(uid))
      .filter((p): p is Profile => Boolean(p));
  }, [membersQ.data, profilesById]);

  const tasks = tasksQ.data ?? [];
  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const pct = tasks.length === 0 ? 0 : (completed / tasks.length) * 100;

  const updateTask = useMutation({
    mutationFn: async (vars: { id: string; patch: Partial<Task> }) => {
      await backendApi.patch(`/api/tasks/${vars.id}`, session?.access_token, { patch: vars.patch });
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
      qc.invalidateQueries({ queryKey: ["my-pending-tasks"] });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (taskId: string) => {
      await backendApi.delete(`/api/tasks/${taskId}`, session?.access_token);
    },
    onMutate: async (taskId) => {
      await qc.cancelQueries({ queryKey: ["tasks", id] });
      const prev = qc.getQueryData<Task[]>(["tasks", id]);
      qc.setQueryData<Task[]>(["tasks", id], (old) => (old ?? []).filter((t) => t.id !== taskId));
      return { prev };
    },
    onError: (err: Error, _taskId, ctx) => {
      if (ctx?.prev) qc.setQueryData(["tasks", id], ctx.prev);
      toast.error(err.message);
    },
    onSuccess: () => toast.success("Task deleted"),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["tasks", id] });
      qc.invalidateQueries({ queryKey: ["projects-with-progress"] });
      qc.invalidateQueries({ queryKey: ["my-pending-tasks"] });
    },
  });

  const deleteProject = useMutation({
    mutationFn: async () => {
      await backendApi.delete(`/api/projects/${id}`, session?.access_token);
    },
    onSuccess: async () => {
      qc.removeQueries({ queryKey: ["project", id] });
      qc.removeQueries({ queryKey: ["tasks", id] });
      qc.removeQueries({ queryKey: ["project-members", id] });
      qc.invalidateQueries({ queryKey: ["projects-with-progress"] });
      qc.invalidateQueries({ queryKey: ["my-pending-tasks"] });
      toast.success("Project deleted");
      await navigate({ to: "/dashboard" });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const projectTone = deadlineTone(projectQ.data?.deadline ?? null);

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
            {projectQ.data?.description && (
              <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
                {projectQ.data.description}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>{completed} of {tasks.length} tasks complete</span>
              {projectQ.data?.deadline && (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" />
                  <span
                    className={
                      projectTone === "overdue"
                        ? "text-destructive"
                        : projectTone === "soon"
                          ? "text-foreground"
                          : ""
                    }
                  >
                    {formatDeadline(projectQ.data.deadline)} · {deadlineLabel(projectQ.data.deadline)}
                  </span>
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <ProjectSettingsButton
                projectId={id}
                currentDeadline={projectQ.data?.deadline ?? null}
                allProfiles={profilesQ.data ?? []}
                memberIds={membersQ.data ?? []}
              />
            )}
            {isAdmin && <AddTaskButton projectId={id} members={memberProfiles} />}
            {isAdmin && (
              <DeleteConfirmButton
                label="Delete project"
                title="Delete project?"
                description="This will permanently delete the project and its tasks."
                onConfirm={() => deleteProject.mutate()}
                disabled={deleteProject.isPending}
              />
            )}
          </div>
        </div>
        {memberProfiles.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Team</span>
            {memberProfiles.map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs"
              >
                {m.first_name} {m.last_name}
              </span>
            ))}
          </div>
        )}
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
              const tone = deadlineTone(t.deadline);
              return (
                <li key={t.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-medium ${t.status === "COMPLETED" ? "text-muted-foreground line-through" : ""}`}>
                        {t.title}
                      </span>
                      <StatusBadge status={t.status} />
                      {t.deadline && t.status !== "COMPLETED" && (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                            tone === "overdue"
                              ? "bg-destructive/10 text-destructive"
                              : tone === "soon"
                                ? "bg-foreground/10 text-foreground"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <CalendarDays className="h-3 w-3" />
                          {formatDeadline(t.deadline)}
                        </span>
                      )}
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
                    members={memberProfiles}
                    onUpdate={(patch) => updateTask.mutate({ id: t.id, patch })}
                    onDelete={() => deleteTask.mutate(t.id)}
                    deleting={deleteTask.isPending}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <WeeklyActivityTimeline
        projectId={id}
        reports={weeklyReportsQ.data ?? []}
        loading={weeklyReportsQ.isLoading}
        token={session?.access_token}
      />
    </div>
  );
}

function formatReportDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function WeeklyActivityTimeline({
  projectId,
  reports,
  loading,
  token,
}: {
  projectId: string;
  reports: WeeklyReportSummary[];
  loading: boolean;
  token?: string;
}) {
  const [openReportId, setOpenReportId] = useState<string>("");

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-xl font-semibold tracking-tight">Weekly Activity Timeline</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Historical weekly snapshots generated from this project&apos;s creation date.
        </p>
      </div>
      {loading ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Loading weekly reports...
        </div>
      ) : reports.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
          No weekly reports have been generated yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Accordion type="single" collapsible value={openReportId} onValueChange={setOpenReportId}>
            {reports.map((report) => (
              <AccordionItem key={report.id} value={report.id} className="px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex w-full flex-col gap-2 pr-3 text-left sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-medium">Week {report.week_number}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatReportDate(report.week_start_date)} - {formatReportDate(report.week_end_date)}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <ReportCount label="Created" value={report.total_tasks_created} />
                      <ReportCount label="Completed" value={report.total_tasks_completed} />
                      <ReportCount label="Pending" value={report.total_pending_tasks} />
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <WeeklyReportDetails
                    projectId={projectId}
                    reportId={report.id}
                    open={openReportId === report.id}
                    token={token}
                  />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}
    </section>
  );
}

function ReportCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted/50 px-2 py-1 text-center">
      <div className="font-semibold text-foreground">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function WeeklyReportDetails({
  projectId,
  reportId,
  open,
  token,
}: {
  projectId: string;
  reportId: string;
  open: boolean;
  token?: string;
}) {
  const detailQ = useQuery({
    queryKey: ["weekly-report", projectId, reportId],
    queryFn: () => backendApi.get<WeeklyReportDetail>(`/api/projects/${projectId}/weekly-reports/${reportId}`, token),
    enabled: open && !!token,
    staleTime: 5 * 60_000,
  });

  if (detailQ.isLoading) {
    return <div className="py-3 text-sm text-muted-foreground">Loading report details...</div>;
  }
  if (detailQ.isError) {
    return <div className="py-3 text-sm text-destructive">{(detailQ.error as Error).message}</div>;
  }

  const report = detailQ.data;
  if (!report) {
    return <div className="py-3 text-sm text-muted-foreground">Open this week to load details.</div>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <SnapshotList title="Created Tasks" tasks={report.created_tasks} />
      <SnapshotList title="Completed Tasks" tasks={report.completed_tasks} />
      <SnapshotList title="Pending Tasks" tasks={report.pending_tasks} />
    </div>
  );
}

function SnapshotList({ title, tasks }: { title: string; tasks: WeeklyReportTaskSnapshot[] }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-2 text-sm font-medium">{title}</div>
      {tasks.length === 0 ? (
        <div className="text-xs text-muted-foreground">No tasks</div>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li key={task.id} className="text-sm">
              <div className="font-medium">{task.task_title}</div>
              <div className="text-xs text-muted-foreground">
                {task.assigned_user_name ? `Assigned to ${task.assigned_user_name}` : "Unassigned"} - {task.task_status}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskActions({
  task, isAdmin, isMine, members, onUpdate, onDelete, deleting,
}: {
  task: Task;
  isAdmin: boolean;
  isMine: boolean;
  members: Profile[];
  onUpdate: (patch: Partial<Task>) => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [reassignOpen, setReassignOpen] = useState(false);

  if (task.status === "COMPLETED") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Locked</span>
        {isAdmin && (
          <EditTaskButton task={task} members={members} onUpdate={onUpdate} />
        )}
        {isAdmin && (
          <DeleteConfirmButton
            label="Delete"
            title="Delete task?"
            description="This task will be permanently deleted."
            onConfirm={onDelete}
            disabled={deleting}
          />
        )}
      </div>
    );
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
        <EditTaskButton task={task} members={members} onUpdate={onUpdate} />
      )}
      {isAdmin && (
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
              profiles={members}
              onPick={(p) => {
                onUpdate({ assignee_id: p.id });
                setReassignOpen(false);
              }}
            />
          </DialogContent>
        </Dialog>
      )}
      {isAdmin && (
        <DeleteConfirmButton
          label="Delete"
          title="Delete task?"
          description="This task will be permanently deleted."
          onConfirm={onDelete}
          disabled={deleting}
        />
      )}
    </div>
  );
}

function EditTaskButton({
  task,
  members,
  onUpdate,
}: {
  task: Task;
  members: Profile[];
  onUpdate: (patch: Partial<Task>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [deadline, setDeadline] = useState(task.deadline ? task.deadline.slice(0, 10) : "");
  const [assigneeId, setAssigneeId] = useState<string | null>(task.assignee_id);

  const currentAssignee = assigneeId ? members.find((m) => m.id === assigneeId) ?? null : null;

  const onOpen = (o: boolean) => {
    if (o) {
      setTitle(task.title);
      setDeadline(task.deadline ? task.deadline.slice(0, 10) : "");
      setAssigneeId(task.assignee_id);
    }
    setOpen(o);
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onUpdate({
      title: trimmed,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      assignee_id: assigneeId,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpen}>
      <DialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          aria-label="Edit task"
          title="Edit task"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`edit-title-${task.id}`}>Title</Label>
            <Input
              id={`edit-title-${task.id}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit-deadline-${task.id}`}>
              Deadline <span className="text-muted-foreground">(optional)</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id={`edit-deadline-${task.id}`}
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
              {deadline && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setDeadline("")}>
                  Clear
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>
              Assign to <span className="text-muted-foreground">(optional, team only)</span>
            </Label>
            {currentAssignee ? (
              <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
                <div className="min-w-0 text-sm">
                  <span className="font-medium">{currentAssignee.first_name} {currentAssignee.last_name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{currentAssignee.email}</span>
                </div>
                <button type="button" onClick={() => setAssigneeId(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <AssigneePicker profiles={members} onPick={(p) => setAssigneeId(p.id)} />
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!title.trim()}>Save changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteConfirmButton({
  label,
  title,
  description,
  onConfirm,
  disabled,
}: {
  label: string;
  title: string;
  description: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="destructive" className="gap-2" disabled={disabled}>
          <Trash2 className="h-4 w-4" />
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function AssigneePicker({
  profiles, onPick,
}: { profiles: Profile[]; onPick: (p: Profile) => void }) {
  const [q, setQ] = useState("");
  const filtered = profiles.filter((p) => {
    const term = q.toLowerCase();
    return (
      p.first_name.toLowerCase().includes(term) ||
      p.last_name.toLowerCase().includes(term) ||
      p.email.toLowerCase().includes(term)
    );
  });
  return (
    <div className="space-y-3">
      {profiles.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          No team members on this project yet. Add members to the project first.
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search team…"
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
        </>
      )}
    </div>
  );
}

function ProjectSettingsButton({
  projectId, currentDeadline, allProfiles, memberIds,
}: {
  projectId: string;
  currentDeadline: string | null;
  allProfiles: Profile[];
  memberIds: string[];
}) {
  const qc = useQueryClient();
  const { user, session } = useAuth();
  const [open, setOpen] = useState(false);
  const [deadline, setDeadline] = useState(
    currentDeadline ? currentDeadline.slice(0, 10) : "",
  );
  const [selected, setSelected] = useState<Set<string>>(new Set(memberIds));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  // Reset state when dialog opens
  const onOpen = (o: boolean) => {
    if (o) {
      setDeadline(currentDeadline ? currentDeadline.slice(0, 10) : "");
      setSelected(new Set(memberIds));
      setQ("");
    }
    setOpen(o);
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return allProfiles.filter((p) => {
      if (!term) return true;
      return (
        p.first_name.toLowerCase().includes(term) ||
        p.last_name.toLowerCase().includes(term) ||
        p.email.toLowerCase().includes(term)
      );
    });
  }, [allProfiles, q]);

  const toggle = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      // Update deadline
      const newDeadline = deadline ? new Date(deadline).toISOString() : null;
      await backendApi.patch(`/api/projects/${projectId}`, session?.access_token, { deadline: newDeadline });

      // Diff members
      const current = new Set(memberIds);
      const toAdd: string[] = [];
      const toRemove: string[] = [];
      selected.forEach((id) => { if (!current.has(id)) toAdd.push(id); });
      current.forEach((id) => { if (!selected.has(id)) toRemove.push(id); });

      if (toAdd.length > 0) {
        await backendApi.post("/api/project-members/bulk", session?.access_token, { project_id: projectId, user_ids: toAdd });
      }
      if (toRemove.length > 0) {
        await backendApi.delete(`/api/project-members/bulk?project_id=${projectId}&user_ids=${toRemove.join(",")}`, session?.access_token);

        // Notify removed users
        if (user) {
          const notes = toRemove
            .filter((uid) => uid !== user.id)
            .map((uid) => ({
              sender_id: user.id,
              recipient_id: uid,
              content: `🚫 You were removed from a project`,
            }));
          if (notes.length > 0) {
            for (const note of notes) {
              await backendApi.post("/api/chat/direct", session?.access_token, note);
            }
          }
        }
      }
      if (toAdd.length > 0 && user) {
        const notes = toAdd
          .filter((uid) => uid !== user.id)
          .map((uid) => ({
            sender_id: user.id,
            recipient_id: uid,
            content: `📁 You were added to a new project`,
          }));
        if (notes.length > 0) {
          for (const note of notes) {
            await backendApi.post("/api/chat/direct", session?.access_token, note);
          }
        }
      }

      qc.invalidateQueries({ queryKey: ["project", projectId] });
      qc.invalidateQueries({ queryKey: ["project-members", projectId] });
      qc.invalidateQueries({ queryKey: ["projects-with-progress"] });
      toast.success("Project updated");
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Users className="h-4 w-4" /> Edit project
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ed">Deadline <span className="text-muted-foreground">(optional)</span></Label>
            <div className="flex gap-2">
              <Input
                id="ed"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
              {deadline && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setDeadline("")}>
                  Clear
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Team members <span className="text-muted-foreground">({selected.size} selected)</span></Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name or email…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border border-border">
              {filtered.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">No matches</div>
              ) : (
                <ul className="divide-y divide-border">
                  {filtered.map((p) => {
                    const sel = selected.has(p.id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => toggle(p.id)}
                          className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors ${
                            sel ? "bg-accent/60" : "hover:bg-accent"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {p.first_name} {p.last_name}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">{p.email}</div>
                          </div>
                          {sel ? (
                            <Check className="h-4 w-4 text-foreground" />
                          ) : (
                            <span className="h-4 w-4 rounded border border-border" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Removing a member who has assigned tasks will fail — reassign their tasks first.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddTaskButton({ projectId, members }: { projectId: string; members: Profile[] }) {
  const { user, session } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [assignee, setAssignee] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const created = await backendApi.post<{ id: string }>(
      "/api/tasks",
      session?.access_token,
      {
        title,
        project_id: projectId,
        assignee_id: assignee?.id ?? null,
        assigned_by: user!.id,
        deadline: deadline ? new Date(deadline).toISOString() : null,
      },
    );
    if (!created?.id) {
      setBusy(false);
      toast.error("Failed to create task");
      return;
    }

    // Notify assignee
    if (assignee && assignee.id !== user!.id && created) {
      await backendApi.post("/api/chat/direct", session?.access_token, {
        sender_id: user!.id,
        recipient_id: assignee.id,
        content: `✅ You were assigned a new task: "${title}"`,
      });
    }

    setBusy(false);
    qc.invalidateQueries({ queryKey: ["tasks", projectId] });
    qc.invalidateQueries({ queryKey: ["projects-with-progress"] });
    qc.invalidateQueries({ queryKey: ["my-pending-tasks"] });
    setOpen(false);
    setTitle("");
    setDeadline("");
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
            <Label htmlFor="tdl">Deadline <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="tdl" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>
              Assign to <span className="text-muted-foreground">(optional, team only)</span>
            </Label>
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
              <AssigneePicker profiles={members} onPick={setAssignee} />
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
