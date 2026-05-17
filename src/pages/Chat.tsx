import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Search, Send, Trash2, Share2, Download, ChevronDown, Settings, LogOut,
  PanelLeftClose, PanelLeftOpen, MessageSquare, ArrowUp, BookmarkPlus,
} from "lucide-react";
import { toast } from "sonner";
import { MessageContent } from "@/components/MessageContent";
import { SettingsDialog } from "@/components/SettingsDialog";
import { useTheme } from "@/hooks/useTheme";

interface Conversation { id: string; title: string; model_id: string | null; share_token: string | null; updated_at: string; }
interface Message { id?: string; role: "user" | "assistant"; content: string; }
interface Provider { id: string; provider_type: string; display_name: string; model_id: string; }

const SUGGESTIONS = [
  "Explain a concept simply",
  "Help me write something",
  "Brainstorm ideas",
  "Plan my day",
];

export default function Chat() {
  const { user, loading, isAdmin, signOut } = useAuth();
  useTheme();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 768);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState<any>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (!loading && !user) navigate("/auth", { replace: true }); }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    loadConversations();
    loadProviders();
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => setProfile(data));
  }, [user]);

  useEffect(() => { if (activeId) loadMessages(activeId); else setMessages([]); }, [activeId]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  // auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  const loadConversations = async () => {
    const { data } = await supabase.from("conversations").select("*").order("updated_at", { ascending: false });
    setConversations((data ?? []) as Conversation[]);
  };
  const loadProviders = async () => {
    const { data } = await supabase.from("ai_providers").select("id,provider_type,display_name,model_id").eq("enabled", true);
    const list = (data ?? []) as Provider[];
    setProviders(list);
    if (list.length && !selectedProvider) setSelectedProvider(list[0]);
  };
  const loadMessages = async (id: string) => {
    const { data } = await supabase.from("messages").select("*").eq("conversation_id", id).order("created_at");
    setMessages((data ?? []) as Message[]);
  };

  const newChat = () => { setActiveId(null); setMessages([]); setInput(""); textareaRef.current?.focus(); };
  const deleteChat = async (id: string) => {
    await supabase.from("conversations").delete().eq("id", id);
    if (activeId === id) newChat();
    loadConversations();
    toast.success("Chat deleted");
  };
  const shareChat = async (id: string) => {
    const token = crypto.randomUUID().replace(/-/g, "");
    const { error } = await supabase.from("conversations").update({ share_token: token }).eq("id", id);
    if (error) return toast.error(error.message);
    await navigator.clipboard.writeText(`${window.location.origin}/share/${token}`);
    toast.success("Share link copied");
  };
  const exportChat = () => {
    if (!messages.length) return;
    const md = messages.map(m => `### ${m.role === "user" ? "You" : "AxoX"}\n\n${m.content}`).join("\n\n---\n\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `axox-chat-${Date.now()}.md`;
    a.click();
  };

  // ChatGPT-style memory hook: detect "remember ..." and save
  const tryCaptureMemory = async (text: string) => {
    if (!user) return;
    const re = /\b(?:remember(?:\s+that)?|please remember|note that|don'?t forget)\s+(.{4,200})/i;
    const m = text.match(re);
    if (!m) return;
    const fact = m[1].trim().replace(/[.!?…]+$/, "");
    if (fact.length < 4) return;
    const { error } = await supabase.from("user_memories").insert({ user_id: user.id, content: fact });
    if (!error) toast.success("Memory updated", { description: fact.slice(0, 80) });
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    if (!selectedProvider) { toast.error("No models available. Ask an admin to add one."); return; }

    setSending(true);
    setInput("");
    tryCaptureMemory(content);

    let convId = activeId;
    if (!convId) {
      const { data, error } = await supabase.from("conversations").insert({
        user_id: user!.id, title: content.slice(0, 60), model_id: selectedProvider.id,
      }).select().single();
      if (error) { toast.error(error.message); setSending(false); return; }
      convId = data.id;
      setActiveId(convId);
      loadConversations();
    }

    const userMsg: Message = { role: "user", content };
    const newMsgs = [...messages, userMsg];
    setMessages([...newMsgs, { role: "assistant", content: "" }]);
    await supabase.from("messages").insert({ conversation_id: convId, role: "user", content });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ providerId: selectedProvider.id, messages: newMsgs }),
      });

      if (resp.status === 429) { toast.error("Rate limit. Please slow down."); throw new Error("rate"); }
      if (resp.status === 402) { toast.error("Out of credits."); throw new Error("credits"); }
      if (!resp.ok || !resp.body) {
        toast.error(`Server busy (${resp.status}). Please try again.`);
        throw new Error("busy");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "", assistant = "", done = false;

      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const p = JSON.parse(json);
            const c = p.choices?.[0]?.delta?.content;
            if (c) {
              assistant += c;
              setMessages(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: assistant };
                return copy;
              });
            }
          } catch { buffer = line + "\n" + buffer; break; }
        }
      }

      if (assistant) {
        await supabase.from("messages").insert({ conversation_id: convId, role: "assistant", content: assistant });
      } else {
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: "_No response received. Please try again._" };
          return copy;
        });
      }
      loadConversations();
    } catch (e: any) {
      console.error(e);
    } finally {
      setSending(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const saveAsMemory = async (text: string) => {
    if (!user || !text.trim()) return;
    await supabase.from("user_memories").insert({ user_id: user.id, content: text.trim().slice(0, 500) });
    toast.success("Saved to memory");
  };

  const filtered = conversations.filter(c => c.title.toLowerCase().includes(search.toLowerCase()));
  const displayName = profile?.display_name ?? user?.email?.split("@")[0] ?? "you";

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;

  return (
    <div className="h-screen flex bg-background relative overflow-hidden">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 bg-foreground/30 backdrop-blur-sm z-30" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:relative fixed inset-y-0 left-0 z-40 w-64 shrink-0 bg-sidebar flex flex-col transition-transform duration-200 ease-out ${sidebarOpen ? "md:translate-x-0" : "md:-ml-64"}`}
      >
        <div className="p-2 flex items-center justify-between gap-1">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={() => setSidebarOpen(false)}>
            <PanelLeftClose className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={newChat} title="New chat">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <button onClick={newChat} className="mx-2 mb-1 flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-sidebar-accent transition-colors text-sidebar-foreground">
          <div className="h-6 w-6 rounded-full bg-foreground text-background grid place-items-center text-[10px] font-semibold">A</div>
          <span className="flex-1 text-left">New chat</span>
        </button>

        <div className="px-2 relative">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search chats"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>

        <div className="flex-1 overflow-y-auto mt-1 px-2 pb-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground px-3 py-2">Chats</div>
          {filtered.map(c => (
            <div
              key={c.id}
              className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer text-sm transition-colors ${activeId === c.id ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60 text-sidebar-foreground"}`}
              onClick={() => { setActiveId(c.id); if (window.innerWidth < 768) setSidebarOpen(false); }}
            >
              <span className="truncate flex-1">{c.title}</span>
              <button onClick={(e) => { e.stopPropagation(); deleteChat(c.id); }} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground px-3 py-6 text-center">No chats yet.</p>
          )}
        </div>

        <div className="border-t border-sidebar-border p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-sidebar-accent transition-colors">
                <div className="h-7 w-7 rounded-full bg-foreground text-background grid place-items-center text-xs font-semibold">
                  {displayName[0]?.toUpperCase()}
                </div>
                <div className="flex-1 text-left text-sm truncate">{displayName}</div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                <Settings className="h-4 w-4 mr-2" /> Settings
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem asChild><Link to="/admin"><Settings className="h-4 w-4 mr-2" />Admin</Link></DropdownMenuItem>
              )}
              <DropdownMenuItem asChild><Link to="/">Landing page</Link></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut().then(() => navigate("/"))}>
                <LogOut className="h-4 w-4 mr-2" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 bg-background">
        <header className="h-12 flex items-center justify-between px-2 md:px-3 shrink-0 gap-2">
          <div className="flex items-center gap-1">
            {!sidebarOpen && (
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={() => setSidebarOpen(true)}>
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="rounded-lg gap-1 font-semibold text-base">
                  AxoX <span className="text-muted-foreground font-normal text-sm">{selectedProvider?.display_name ?? ""}</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>Choose a model</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {providers.length === 0 && <DropdownMenuItem disabled>No models configured</DropdownMenuItem>}
                {providers.map(p => (
                  <DropdownMenuItem key={p.id} onClick={() => setSelectedProvider(p)}>
                    <div className="flex flex-col">
                      <span className="text-sm">{p.display_name}</span>
                      <span className="text-[10px] text-muted-foreground">{p.provider_type} · {p.model_id}</span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-1">
            {activeId && (<>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={() => shareChat(activeId)} title="Share"><Share2 className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={exportChat} title="Export"><Download className="h-4 w-4" /></Button>
            </>)}
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg md:hidden" onClick={newChat} title="New chat">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center px-6">
              <h1 className="font-serif text-2xl md:text-3xl text-center mb-8">
                What can I help with?
              </h1>
              <div className="w-full max-w-2xl">
                <Composer
                  textareaRef={textareaRef}
                  input={input}
                  setInput={setInput}
                  sending={sending}
                  onSend={() => send()}
                />
                <div className="flex flex-wrap gap-2 mt-4 justify-center">
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-secondary transition-colors text-muted-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-6">
                {messages.map((m, i) => (
                  <div key={i} className="animate-fade-in-up group">
                    {m.role === "user" ? (
                      <div className="flex justify-end">
                        <div className="max-w-[85%] bg-secondary text-secondary-foreground rounded-3xl px-4 py-2.5 text-[15px] whitespace-pre-wrap">
                          {m.content}
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <div className="h-7 w-7 rounded-full bg-foreground text-background grid place-items-center text-[11px] font-semibold shrink-0">A</div>
                        <div className="flex-1 min-w-0">
                          {!m.content && sending ? (
                            <span className="inline-flex items-center gap-1 text-muted-foreground text-sm pt-1">
                              <span className="status-dot" /><span className="status-dot" /><span className="status-dot" />
                            </span>
                          ) : (
                            <>
                              <div className="prose-chat text-[15px] leading-7 text-foreground">
                                <MessageContent content={m.content} />
                              </div>
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 mt-2">
                                <button
                                  onClick={() => { navigator.clipboard.writeText(m.content); toast.success("Copied"); }}
                                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-secondary"
                                >Copy</button>
                                <button
                                  onClick={() => saveAsMemory(m.content)}
                                  className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-secondary inline-flex items-center gap-1"
                                >
                                  <BookmarkPlus className="h-3 w-3" /> Remember
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="px-4 md:px-6 pb-4 pt-2 sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent">
                <div className="max-w-3xl mx-auto">
                  <Composer
                    textareaRef={textareaRef}
                    input={input}
                    setInput={setInput}
                    sending={sending}
                    onSend={() => send()}
                  />
                  <p className="text-[11px] text-muted-foreground text-center mt-2">AxoX can make mistakes. Check important info.</p>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

function Composer({
  textareaRef, input, setInput, sending, onSend,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  input: string;
  setInput: (v: string) => void;
  sending: boolean;
  onSend: () => void;
}) {
  return (
    <div className="relative rounded-3xl border border-border bg-secondary/40 focus-within:border-foreground/30 transition-colors">
      <Textarea
        ref={textareaRef}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
        placeholder="Message AxoX"
        rows={1}
        className="resize-none min-h-[52px] max-h-[200px] pr-12 pl-5 py-3.5 bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 text-[15px]"
      />
      <Button
        onClick={onSend}
        disabled={!input.trim() || sending}
        size="icon"
        className="absolute right-2 bottom-2 h-9 w-9 rounded-full bg-foreground text-background hover:bg-foreground/85 disabled:bg-secondary disabled:text-muted-foreground"
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
    </div>
  );
}
