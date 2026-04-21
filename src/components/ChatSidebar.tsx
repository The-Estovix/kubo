import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, X, Search, Send, ArrowLeft } from "lucide-react";

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

export function ChatSidebar() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activePeer, setActivePeer] = useState<ChatUser | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load users + all messages involving me
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .neq("id", user.id);
      setUsers((profs ?? []) as ChatUser[]);

      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("*")
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order("created_at", { ascending: true });
      setMessages((msgs ?? []) as Message[]);
    })();
  }, [user]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("chat-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const m = payload.new as Message;
          if (m.sender_id === user.id || m.recipient_id === user.id) {
            setMessages((prev) => (prev.find((x) => x.id === m.id) ? prev : [...prev, m]));
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages" },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Mark messages from active peer as read
  useEffect(() => {
    if (!user || !activePeer || !open) return;
    const unread = messages.filter(
      (m) => m.sender_id === activePeer.id && m.recipient_id === user.id && !m.read_at,
    );
    if (unread.length === 0) return;
    supabase
      .from("chat_messages")
      .update({ read_at: new Date().toISOString() })
      .in(
        "id",
        unread.map((m) => m.id),
      )
      .then(() => {});
  }, [activePeer, messages, user, open]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, activePeer]);

  const unreadTotal = useMemo(
    () => messages.filter((m) => m.recipient_id === user?.id && !m.read_at).length,
    [messages, user],
  );

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
    if (!activePeer || !user) return [];
    return messages.filter(
      (m) =>
        (m.sender_id === user.id && m.recipient_id === activePeer.id) ||
        (m.sender_id === activePeer.id && m.recipient_id === user.id),
    );
  }, [messages, activePeer, user]);

  const send = async () => {
    if (!user || !activePeer || !draft.trim()) return;
    const content = draft.trim();
    setDraft("");
    const { error } = await supabase.from("chat_messages").insert({
      sender_id: user.id,
      recipient_id: activePeer.id,
      content,
    });
    if (error) setDraft(content);
  };

  if (!user) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-transform hover:scale-105"
        aria-label="Open chat"
      >
        <MessageCircle className="h-5 w-5" />
        {unreadTotal > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">
            {unreadTotal > 99 ? "99+" : unreadTotal}
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
                {activePeer && (
                  <button
                    onClick={() => setActivePeer(null)}
                    className="rounded-md p-1 hover:bg-accent"
                    aria-label="Back"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                <h2 className="font-display text-base font-semibold tracking-tight">
                  {activePeer ? `${activePeer.first_name} ${activePeer.last_name}` : "Messages"}
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

            {!activePeer ? (
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
                  {conversation.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      Start the conversation.
                    </div>
                  ) : (
                    conversation.map((m) => {
                      const mine = m.sender_id === user.id;
                      return (
                        <div
                          key={m.id}
                          className={`flex ${mine ? "justify-end" : "justify-start"}`}
                        >
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
                    placeholder="Type a message…"
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
