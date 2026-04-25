import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { backendApi } from "@/lib/backend-api";

export type Role = "admin" | "employee";

export interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: Role | null;
  isAdmin: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string, accessToken?: string) => {
    const [p, r] = await Promise.all([
      backendApi.get<Profile | null>(`/api/profiles/${userId}`, accessToken),
      backendApi.get<{ role: Role | null }>(`/api/users/role/${userId}`, accessToken),
    ]);
    setProfile(p);
    setRole(r.role ?? null);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (import.meta.env.DEV) {
        console.log("AUTH EVENT:", event);
        console.log("SESSION:", s);
      }
      setSession(s);
      if (s?.user) {
        setTimeout(() => loadProfile(s.user.id, s.access_token), 0);
      } else {
        setProfile(null);
        setRole(null);
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      if (import.meta.env.DEV) {
        console.log("INITIAL SESSION:", data.session);
      }
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id, data.session.access_token);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    loading,
    session,
    user: session?.user ?? null,
    profile,
    role,
    isAdmin: role === "admin",
    signOut: async () => {
      await supabase.auth.signOut();
    },
    refresh: async () => {
      if (session?.user) await loadProfile(session.user.id, session.access_token);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
