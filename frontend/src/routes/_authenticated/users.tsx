import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { backendApi } from "@/lib/backend-api";

export const Route = createFileRoute("/_authenticated/users")({
  component: UsersPage,
});

interface UserRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: "admin" | "employee" | null;
}

async function fetchUsers(token?: string): Promise<UserRow[]> {
  return backendApi.get<UserRow[]>("/api/users", token);
}

function UsersPage() {
  const { isAdmin, user, loading, session } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !isAdmin) navigate({ to: "/dashboard" });
  }, [loading, isAdmin, navigate]);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["all-users"],
    queryFn: () => fetchUsers(session?.access_token),
    enabled: isAdmin && !!session?.access_token,
    staleTime: 60_000,
  });

  const promote = useMutation({
    mutationFn: async (userId: string) => {
      await backendApi.put(`/api/users/role/${userId}`, session?.access_token, { role: "admin" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-users"] });
      toast.success("Promoted to Admin");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const demote = useMutation({
    mutationFn: async (userId: string) => {
      await backendApi.put(`/api/users/role/${userId}`, session?.access_token, { role: "employee" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-users"] });
      toast.success("Demoted to Employee");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage team roles and permissions.</p>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === user?.id;
                return (
                  <tr key={u.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">
                      {u.first_name} {u.last_name}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          u.role === "admin"
                            ? "bg-foreground text-background"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        {u.role ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isSelf ? (
                        <span className="text-xs text-muted-foreground">You</span>
                      ) : u.role === "admin" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => demote.mutate(u.id)}
                          disabled={demote.isPending}
                        >
                          <ShieldOff className="h-3.5 w-3.5" /> Demote
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="gap-1.5"
                          onClick={() => promote.mutate(u.id)}
                          disabled={promote.isPending}
                        >
                          <ShieldCheck className="h-3.5 w-3.5" /> Promote to Admin
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
