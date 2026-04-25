import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, X, Search, Send, ArrowLeft, Globe, Bell, AlertTriangle, Clock, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { daysUntil, formatDeadline, deadlineLabel, deadlineTone } from "@/lib/deadline";
import { Link } from "@tanstack/react-router";
import { backendApi } from "@/lib/backend-api";

interface ChatUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
}

interface GlobalMessage {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

interface ReminderItem {
  kind: "project" | "task";
  id: string;
  title: string;
  subtitle: string;
  deadline: string;
  projectId: string;
}

type Tab = "chats" | "reminders";
type ActivePeer = ChatUser | { id: "__global__" };

const NOTIFICATION_PREFIXES = ["✅ ", "📁 ", "🚫 "];

function isNotification(content: string): boolean {
  return NOTIFICATION_PREFIXES.some((p) => content.startsWith(p));
}

function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  if (incoming.length === 0) return existing;
  const map = new Map(existing.map((m) => [m.id, m]));
  for (const m of incoming) {
    map.set(m.id, m);
  }
  return Array.from(map.values()).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function ChatSidebar() {
  const { user, session } = useAuth();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("chats");
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [globalMessages, setGlobalMessages] = useState<GlobalMessage[]>([]);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [activePeer, setActivePeer] = useState<ActivePeer | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenMessageIds = useRef<Set<string>>(new Set());

  const isGlobal = activePeer?.id === "__global__";
  const peerUser = activePeer && !isGlobal ? (activePeer as ChatUser) : null;

  const syncDirectMessages = async () => {
    if (!user) return;
    const incoming = await backendApi.get<Message[]>(
      `/api/chat/direct?user_id=${user.id}`,
      session?.access_token,
    );
    incoming.forEach((m) => seenMessageIds.current.add(m.id));
    setMessages((prev) => mergeMessages(prev, incoming));
  };

  // Initial load
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [profs, msgs, globals] = await Promise.all([
        backendApi.get<ChatUser[]>(`/api/profiles?exclude_id=${user.id}`, session?.access_token),
        backendApi.get<Message[]>(`/api/chat/direct?user_id=${user.id}`, session?.access_token),
        backendApi.get<GlobalMessage[]>("/api/chat/global", session?.access_token),
      ]);
      setUsers((profs ?? []) as ChatUser[]);
      const initial = (msgs ?? []) as Message[];
      setMessages(initial);
      initial.forEach((m) => seenMessageIds.current.add(m.id));
      setGlobalMessages((globals ?? []) as GlobalMessage[]);
    })();
  }, [user]);

  // Load reminders (deadlines within 3 days, including overdue) — for projects I'm in & tasks assigned to me
  const loadReminders = async () => {
    if (!user) return;
    const items = await backendApi.get<ReminderItem[]>(`/api/reminders?user_id=${user.id}`, session?.access_token);
    setReminders(items);
  };

  useEffect(() => { loadReminders(); }, [user]);
  // Refresh reminders when sidebar opened
  useEffect(() => { if (open) loadReminders(); }, [open]);

  // Fallback sync: keeps DMs current if realtime events are missed.
  useEffect(() => {
    if (!user || !open || tab !== "chats") return;
    const timer = setInterval(() => {
      syncDirectMessages();
    }, 10000);
    return () => clearInterval(timer);
  }, [user, open, tab, session?.access_token]);

  // Mark DMs read
  useEffect(() => {
    if (!user || !peerUser || !open || tab !== "chats") return;
    const unread = messages.filter(
      (m) => m.sender_id === peerUser.id && m.recipient_id === user.id && !m.read_at,
    );
    if (unread.length === 0) return;
    backendApi
      .patch("/api/chat/direct/read", session?.access_token, {
        ids: unread.map((m) => m.id),
        read_at: new Date().toISOString(),
      })
      .then(() => {});
  }, [peerUser, messages, user, open, tab, session?.access_token]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, globalMessages, activePeer]);

  const unreadTotal = useMemo(
    () => messages.filter((m) => m.recipient_id === user?.id && !m.read_at).length,
    [messages, user],
  );

  const reminderCount = reminders.length;

  const unreadByUser = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of messages) {
      if (m.recipient_id === user?.id && !m.read_at) {
        map.set(m.sender_id, (map.get(m.sender_id) ?? 0) + 1);
      }
    }
    return map;
  }, [messages, user]);

  const lastByUser = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messages) {
      const peer = m.sender_id === user?.id ? m.recipient_id : m.sender_id;
      const cur = map.get(peer);
      if (!cur || cur.created_at < m.created_at) map.set(peer, m);
    }
    return map;
  }, [messages, user]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? users.filter(
          (u) =>
            `${u.first_name} ${u.last_name}`.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q),
        )
      : users;
    return [...list].sort((a, b) => {
      const ua = unreadByUser.get(a.id) ?? 0;
      const ub = unreadByUser.get(b.id) ?? 0;
      if (ua !== ub) return ub - ua;
      const la = lastByUser.get(a.id)?.created_at ?? "";
      const lb = lastByUser.get(b.id)?.created_at ?? "";
      return lb.localeCompare(la);
    });
  }, [users, search, unreadByUser, lastByUser]);

  const conversation = useMemo(() => {
    if (!peerUser || !user) return [];
    return messages.filter(
      (m) =>
        (m.sender_id === user.id && m.recipient_id === peerUser.id) ||
        (m.sender_id === peerUser.id && m.recipient_id === user.id),
    );
  }, [messages, peerUser, user]);

  const userMap = useMemo(() => {
    const map = new Map<string, ChatUser>();
    for (const u of users) map.set(u.id, u);
    return map;
  }, [users]);

  const lastGlobal = globalMessages[globalMessages.length - 1];

  const send = async () => {
    if (!user || !activePeer || !draft.trim()) return;
    const content = draft.trim();
    setDraft("");
    if (isGlobal) {
      try {
        const g = await backendApi.post<GlobalMessage>("/api/chat/global", session?.access_token, { sender_id: user.id, content });
        setGlobalMessages((prev) => (prev.some((m) => m.id === g.id) ? prev : [...prev, g]));
      } catch {
        setDraft(content);
      }
    } else if (peerUser) {
      try {
        const m = await backendApi.post<Message>("/api/chat/direct", session?.access_token, {
          sender_id: user.id,
          recipient_id: peerUser.id,
          content,
        });
        seenMessageIds.current.add(m.id);
        setMessages((prev) => mergeMessages(prev, [m]));
      } catch {
        setDraft(content);
      }
    }
  };

  if (!user) return null;

  const totalBadge = unreadTotal + reminderCount;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-transform hover:scale-105"
        aria-label="Open chat"
      >
        <MessageCircle className="h-5 w-5" />
        {totalBadge > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">
            {totalBadge > 99 ? "99+" : totalBadge}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={() => setOpen(false)}>
          <aside
            className="flex h-full w-full max-w-sm flex-col border-l border-border bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                {activePeer && tab === "chats" && (
                  <button
                    onClick={() => setActivePeer(null)}
                    className="rounded-md p-1 hover:bg-accent"
                    aria-label="Back"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                <h2 className="font-display text-base font-semibold tracking-tight">
                  {tab === "reminders"
                    ? "Reminders"
                    : isGlobal
                      ? "Global chat"
                      : peerUser
                        ? `${peerUser.first_name} ${peerUser.last_name}`
                        : "Messages"}
                </h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1 hover:bg-accent"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border">
              <button
                onClick={() => { setTab("chats"); }}
                className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-sm transition-colors ${
                  tab === "chats" ? "border-b-2 border-foreground font-medium" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <MessageCircle className="h-4 w-4" /> Chats
                {unreadTotal > 0 && (
                  <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">
                    {unreadTotal}
                  </span>
                )}
              </button>
              <button
                onClick={() => { setTab("reminders"); setActivePeer(null); }}
                className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-sm transition-colors ${
                  tab === "reminders" ? "border-b-2 border-foreground font-medium" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Bell className="h-4 w-4" /> Reminders
                {reminderCount > 0 && (
                  <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">
                    {reminderCount}
                  </span>
                )}
              </button>
            </div>

            {tab === "reminders" ? (
              <div className="flex-1 overflow-y-auto">
                {reminders.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    <Bell className="mx-auto mb-2 h-8 w-8 opacity-30" />
                    No deadlines in the next 3 days.
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {reminders.map((r) => {
                      const tone = deadlineTone(r.deadline);
                      const days = daysUntil(r.deadline);
                      return (
                        <li key={`${r.kind}-${r.id}`}>
                          <Link
                            to="/projects/$id"
                            params={{ id: r.projectId }}
                            onClick={() => setOpen(false)}
                            className="block px-4 py-3 transition-colors hover:bg-accent"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  {tone === "overdue" ? (
                                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                                  ) : (
                                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                  )}
                                  <span className="truncate text-sm font-medium">{r.title}</span>
                                </div>
                                <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <span className="uppercase tracking-wider">{r.kind}</span>
                                  <span>·</span>
                                  <span className="truncate">{r.subtitle}</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className={`text-xs font-medium ${tone === "overdue" ? "text-destructive" : ""}`}>
                                  {deadlineLabel(r.deadline)}
                                </div>
                                <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <CalendarDays className="h-3 w-3" />
                                  {formatDeadline(r.deadline)}
                                </div>
                              </div>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : !activePeer ? (
              <>
                <div className="border-b border-border p-3">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search people…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <button
                    onClick={() => setActivePeer({ id: "__global__" })}
                    className="flex w-full items-center gap-3 border-b border-border bg-accent/30 px-4 py-3 text-left transition-colors hover:bg-accent"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                      <Globe className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">Global chat</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {lastGlobal
                          ? `${
                              lastGlobal.sender_id === user.id
                                ? "You"
                                : userMap.get(lastGlobal.sender_id)?.first_name ?? "Someone"
                            }: ${lastGlobal.content}`
                          : "Everyone can see these messages"}
                      </div>
                    </div>
                  </button>
                  {filteredUsers.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">No users found.</div>
                  ) : (
                    filteredUsers.map((u) => {
                      const unread = unreadByUser.get(u.id) ?? 0;
                      const last = lastByUser.get(u.id);
                      return (
                        <button
                          key={u.id}
                          onClick={() => setActivePeer(u)}
                          className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-accent"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                            {u.first_name[0]?.toUpperCase()}
                            {u.last_name[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="truncate text-sm font-medium">
                                {u.first_name} {u.last_name}
                              </div>
                              {unread > 0 && (
                                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">
                                  {unread}
                                </span>
                              )}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {last
                                ? `${last.sender_id === user.id ? "You: " : ""}${last.content}`
                                : u.email}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              <>
                <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
                  {isGlobal ? (
                    globalMessages.length === 0 ? (
                      <div className="py-10 text-center text-sm text-muted-foreground">
                        No messages yet. Say hi to everyone!
                      </div>
                    ) : (
                      globalMessages.map((m) => {
                        const mine = m.sender_id === user.id;
                        const sender = userMap.get(m.sender_id);
                        const name = mine
                          ? "You"
                          : sender
                            ? `${sender.first_name} ${sender.last_name}`
                            : "Unknown";
                        return (
                          <div
                            key={m.id}
                            className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
                          >
                            {!mine && (
                              <div className="mb-0.5 px-1 text-[10px] font-medium text-muted-foreground">
                                {name}
                              </div>
                            )}
                            <div
                              className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                                mine
                                  ? "bg-foreground text-background"
                                  : "bg-muted text-foreground"
                              }`}
                            >
                              {m.content}
                            </div>
                          </div>
                        );
                      })
                    )
                  ) : conversation.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      Start the conversation.
                    </div>
                  ) : (
                    conversation.map((m) => {
                      const mine = m.sender_id === user.id;
                      const notif = !mine && isNotification(m.content);
                      return (
                        <div
                          key={m.id}
                          className={`flex ${mine ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                              notif
                                ? "border border-border bg-accent/40 text-foreground"
                                : mine
                                  ? "bg-foreground text-background"
                                  : "bg-muted text-foreground"
                            }`}
                          >
                            {m.content}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    send();
                  }}
                  className="flex items-center gap-2 border-t border-border p-3"
                >
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={isGlobal ? "Message everyone…" : "Type a message…"}
                    autoFocus
                  />
                  <Button type="submit" size="icon" disabled={!draft.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

