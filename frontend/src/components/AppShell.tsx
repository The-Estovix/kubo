import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LogOut, Moon, Sun, UserRound, Users } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { ChatSidebar } from "@/components/ChatSidebar";
import { useTheme } from "@/lib/theme";
import { backendApi } from "@/lib/backend-api";
import { supabase } from "@/integrations/supabase/client";
import kuboLogo from "@/assets/branding/image.png";
import { toast } from "sonner";

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, role, isAdmin, refresh, session, signOut, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFirstName(profile.first_name);
    setLastName(profile.last_name);
  }, [profile, profileOpen]);

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const saveProfile = async () => {
    if (!user || !session?.access_token) return;
    const nextFirstName = firstName.trim();
    const nextLastName = lastName.trim();
    if (!nextFirstName || !nextLastName) {
      toast.error("First name and last name are required.");
      return;
    }

    setSavingProfile(true);
    try {
      await backendApi.put(`/api/profiles/${user.id}`, session.access_token, {
        first_name: nextFirstName,
        last_name: nextLastName,
      });
      const { error: authUpdateError } = await supabase.auth.updateUser({
        data: {
          first_name: nextFirstName,
          last_name: nextLastName,
        },
      });
      if (authUpdateError) {
        throw authUpdateError;
      }
      await refresh();
      toast.success("Profile updated");
      setProfileOpen(false);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/dashboard" className="flex shrink-0 items-center">
            <img
              src={kuboLogo}
              alt="KUBO logo"
              className="h-9 md:h-10 w-auto max-w-[160px] object-contain"
            />
          </Link>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link to="/users">
                <Button variant="ghost" size="sm" className="gap-2">
                  <Users className="h-4 w-4" />
                  <span className="hidden sm:inline">Users</span>
                </Button>
              </Link>
            )}
            {profile && (
              <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="max-w-40 rounded-md px-2 py-1 text-right transition-colors hover:bg-accent"
                  >
                    <div className="truncate text-sm font-medium leading-tight">
                      {profile.first_name} {profile.last_name}
                    </div>
                    <div className="truncate text-xs capitalize text-muted-foreground leading-tight">{role}</div>
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <UserRound className="h-5 w-5" />
                      My Profile
                    </DialogTitle>
                    <DialogDescription>
                      Update the name shown across the app for your account.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="profile-email">Email</Label>
                      <Input id="profile-email" value={profile.email} disabled />
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="profile-first-name">First name</Label>
                        <Input
                          id="profile-first-name"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="profile-last-name">Last name</Label>
                        <Input
                          id="profile-last-name"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setProfileOpen(false)}
                      disabled={savingProfile}
                    >
                      Cancel
                    </Button>
                    <Button type="button" onClick={saveProfile} disabled={savingProfile}>
                      {savingProfile ? "Saving..." : "Save changes"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="gap-2"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <ChatSidebar />
    </div>
  );
}
