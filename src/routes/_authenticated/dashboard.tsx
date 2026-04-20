import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { ProgressBar } from "@/components/ProgressBar";
import { Plus, FolderOpen } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

interface ProjectWithProgress {
  id: string;
  name: string;
  status: string;
  total: number;
  completed: number;
}

async function fetchProjects(): Promise<ProjectWithProgress[]> {
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, name, status")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!projects || projects.length === 0) return [];

  const { data: tasks, error: tErr } = await supabase
    .from("tasks")
    .select("project_id, status");
  if (tErr) throw tErr;

  return projects.map((p) => {
    const ts = (tasks ?? []).filter((t) => t.project_id === p.id);
    const completed = ts.filter((t) => t.status === "COMPLETED").length;
    return { ...p, total: ts.length, completed };
  });
}

function DashboardPage() {
  const { profile, isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects-with-progress"],
    queryFn: fetchProjects,
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const create = useMutation({
    mutationFn: async (n: string) => {
      const { error } = await supabase.from("projects").insert({ name: n, created_by: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects-with-progress"] });
      setOpen(false);
      setName("");
      toast.success("Project created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await create.mutateAsync(name);
    setBusy(false);
  };

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
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" /> New project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New project</DialogTitle>
              </DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="pname">Project name</Label>
                  <Input id="pname" required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={busy || !name.trim()}>
                    {busy ? "Creating…" : "Create"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading projects…</div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 py-20 text-center">
          <FolderOpen className="mb-3 h-10 w-10 text-muted-foreground" />
          <div className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            No current project
          </div>
          {isAdmin && (
            <p className="mt-2 text-sm text-muted-foreground">Click “New project” to create one.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const pct = p.total === 0 ? 0 : (p.completed / p.total) * 100;
            const isActive = p.total > 0 && p.completed < p.total;
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
                <div className="mt-1 text-xs text-muted-foreground">
                  {p.completed} / {p.total} tasks complete
                </div>
                <div className="mt-4">
                  <ProgressBar value={pct} />
                  <div className="mt-1.5 text-right text-xs font-medium text-muted-foreground">
                    {Math.round(pct)}%
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
