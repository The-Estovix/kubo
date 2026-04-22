import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ProgressBar } from "@/components/ProgressBar";
import { Plus, FolderOpen, Search, X, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

interface Profile { id: string; first_name: string; last_name: string; email: string; }
interface ProjectWithProgress {
  id: string;
  name: string;
  description: string;
  status: string;
  total: number;
  completed: number;
  memberIds: string[];
  assigneeIds: string[];
  createdBy: string;
}

async function fetchProjects(): Promise<ProjectWithProgress[]> {
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, name, description, status, created_by")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!projects || projects.length === 0) return [];

  const [{ data: tasks, error: tErr }, { data: members, error: mErr }] = await Promise.all([
    supabase.from("tasks").select("project_id, status, assignee_id"),
    supabase.from("project_members").select("project_id, user_id"),
  ]);
  if (tErr) throw tErr;
  if (mErr) throw mErr;

  return projects.map((p) => {
    const ts = (tasks ?? []).filter((t) => t.project_id === p.id);
    const completed = ts.filter((t) => t.status === "COMPLETED").length;
    const memberIds = (members ?? []).filter((m) => m.project_id === p.id).map((m) => m.user_id);
    const assigneeIds = Array.from(
      new Set(ts.map((t) => t.assignee_id).filter((x): x is string => !!x)),
    );
    return {
      id: p.id,
      name: p.name,
      description: p.description ?? "",
      status: p.status,
      total: ts.length,
      completed,
      memberIds,
      assigneeIds,
      createdBy: p.created_by,
    };
  });
}

function DashboardPage() {
  const { profile, isAdmin, user } = useAuth();
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects-with-progress"],
    queryFn: fetchProjects,
  });

  const profilesQ = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, first_name, last_name, email");
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });
  const profiles = profilesQ.data ?? [];
  const profilesById = useMemo(() => {
    const m = new Map<string, Profile>();
    profiles.forEach((p) => m.set(p.id, p));
    return m;
  }, [profiles]);

  const [search, setSearch] = useState("");
  // filter: "all" | "me" | userId
  const [filter, setFilter] = useState<string>("all");

  const otherUsers = useMemo(
    () => profiles.filter((p) => p.id !== user?.id),
    [profiles, user?.id],
  );

  const visibleProjects = useMemo(() => {
    let list = projects;
    if (filter === "me" && user) {
      list = list.filter((p) => p.memberIds.includes(user.id));
    } else if (filter !== "all") {
      list = list.filter((p) => p.memberIds.includes(filter));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
      );
    }
    return list;
  }, [projects, filter, search, user]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Welcome back, {profile?.first_name || "there"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {projects.length > 0
              ? `${projects.length} project${projects.length === 1 ? "" : "s"}`
              : "Let's get organized."}
          </p>
        </div>
        {isAdmin && <NewProjectDialog profiles={profiles} userId={user!.id} />}
      </div>

      {projects.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search projects…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="sm:w-64">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              <SelectItem value="me">Assigned to me</SelectItem>
              {otherUsers.length > 0 && (
                <div className="my-1 border-t border-border" />
              )}
              {otherUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  Assigned to {u.first_name} {u.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading projects…</div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 py-20 text-center">
          <FolderOpen className="mb-3 h-10 w-10 text-muted-foreground" />
          <div className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            No current project
          </div>
          {isAdmin && (
            <p className="mt-2 text-sm text-muted-foreground">Click “Add project” to create one.</p>
          )}
        </div>
      ) : visibleProjects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 py-12 text-center text-sm text-muted-foreground">
          No projects match your filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleProjects.map((p) => {
            const pct = p.total === 0 ? 0 : (p.completed / p.total) * 100;
            const isActive = p.total > 0 && p.completed < p.total;
            const memberPreview = p.memberIds
              .map((id) => profilesById.get(id))
              .filter(Boolean)
              .slice(0, 3) as Profile[];
            return (
              <Link
                key={p.id}
                to="/projects/$id"
                params={{ id: p.id }}
                className={`group rounded-xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-sm ${
                  isActive ? "border-foreground/15" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-base font-semibold tracking-tight group-hover:underline underline-offset-4">
                    {p.name}
                  </h3>
                  {isActive && (
                    <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--status-active)]" />
                  )}
                </div>
                {p.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                )}
                <div className="mt-2 text-xs text-muted-foreground">
                  {p.completed} / {p.total} tasks complete
                </div>
                <div className="mt-4">
                  <ProgressBar value={pct} />
                  <div className="mt-1.5 text-right text-xs font-medium text-muted-foreground">
                    {Math.round(pct)}%
                  </div>
                </div>
                {memberPreview.length > 0 && (
                  <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>Team:</span>
                    <span className="text-foreground">
                      {memberPreview.map((m) => m.first_name).join(", ")}
                      {p.memberIds.length > memberPreview.length &&
                        ` +${p.memberIds.length - memberPreview.length}`}
                    </span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewProjectDialog({ profiles, userId }: { profiles: Profile[]; userId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [busy, setBusy] = useState(false);

  // Always include creator as a member
  const effectiveMembers = useMemo(() => {
    const set = new Set(memberIds);
    set.add(userId);
    return Array.from(set);
  }, [memberIds, userId]);

  const filteredProfiles = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    return profiles.filter((p) => {
      if (!q) return true;
      return (
        p.first_name.toLowerCase().includes(q) ||
        p.last_name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q)
      );
    });
  }, [profiles, memberQuery]);

  const reset = () => {
    setName("");
    setDescription("");
    setMemberIds([]);
    setMemberQuery("");
  };

  const create = useMutation({
    mutationFn: async () => {
      const { data: project, error } = await supabase
        .from("projects")
        .insert({ name, description, created_by: userId })
        .select("id")
        .single();
      if (error) throw error;
      const rows = effectiveMembers.map((uid) => ({ project_id: project.id, user_id: uid }));
      const { error: mErr } = await supabase.from("project_members").insert(rows);
      if (mErr) throw mErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects-with-progress"] });
      setOpen(false);
      reset();
      toast.success("Project created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await create.mutateAsync();
    setBusy(false);
  };

  const toggle = (id: string) => {
    if (id === userId) return; // creator always included
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Add project
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pname">Project name</Label>
            <Input id="pname" required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pdesc">Description</Label>
            <Textarea
              id="pdesc"
              required
              rows={3}
              placeholder="Brief description of the project…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              Team members{" "}
              <span className="text-muted-foreground">
                ({effectiveMembers.length} selected)
              </span>
            </Label>
            <p className="text-xs text-muted-foreground">
              Only team members can be assigned tasks on this project.
            </p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name or email…"
                value={memberQuery}
                onChange={(e) => setMemberQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="max-h-56 overflow-y-auto rounded-md border border-border">
              {filteredProfiles.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">No matches</div>
              ) : (
                <ul className="divide-y divide-border">
                  {filteredProfiles.map((p) => {
                    const selected = effectiveMembers.includes(p.id);
                    const isCreator = p.id === userId;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => toggle(p.id)}
                          disabled={isCreator}
                          className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors ${
                            selected ? "bg-accent/60" : "hover:bg-accent"
                          } ${isCreator ? "cursor-default opacity-80" : ""}`}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {p.first_name} {p.last_name}
                              {isCreator && (
                                <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                                  you
                                </span>
                              )}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">{p.email}</div>
                          </div>
                          {selected ? (
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
            {effectiveMembers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {effectiveMembers.map((id) => {
                  const p = profiles.find((x) => x.id === id);
                  if (!p) return null;
                  const isCreator = id === userId;
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs"
                    >
                      {p.first_name}
                      {!isCreator && (
                        <button
                          type="button"
                          onClick={() => toggle(id)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={busy || !name.trim() || !description.trim()}
            >
              {busy ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
