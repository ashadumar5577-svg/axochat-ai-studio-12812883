import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Plus, Search, MessageSquare, Send, Sparkles, Trash2, Share2, Download, ChevronDown, Settings, LogOut, Crown, Zap, Code, Lightbulb, FileText, Wand2, PanelLeftClose, PanelLeftOpen, Sun, Moon } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { useTheme } from "@/hooks/useTheme";

interface Conversation { id: string; title: string; model_id: string | null; share_token: string | null; updated_at: string; }
interface Message { id?: string; role: "user" | "assistant"; content: string; }
interface Provider { id: string; provider_type: string; display_name: string; model_id: string; }

const PROMPTS = [
  { icon: Code, title: "Write code", body: "Write a Python function that finds prime numbers up to N using the Sieve of Eratosthenes." },
  { icon: Lightbulb, title: "Explain a concept", body: "Explain how transformer attention works, in simple terms with an analogy." },
  { icon: FileText, title: "Draft an email", body: "Write a professional email asking for a one-week extension on a project deadline." },
  { icon: Wand2, title: "Brainstorm", body: "Give me 10 unique startup ideas in the AI productivity space, ranked by feasibility." },
];

const roleBadge = (roles: string[]) => {
  if (roles.includes("co_founder")) return { label: "Co‑founder", cls: "bg-gradient-warm text-primary-foreground" };
  if (roles.includes("admin")) return { label: "Admin", cls: "bg-primary/20 text-primary" };
  if (roles.includes("special")) return { label: "Special", cls: "bg-accent/20 text-accent" };
  if (roles.includes("premium")) return { label: "Premium", cls: "bg-emerald-500/20 text-emerald-400" };
  return { label: "Member", cls: "bg-secondary text-muted-foreground" };
};

export default function Chat() {
  const { user, loading, roles, isAdmin, signOut } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= 768;
  });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streamPhase, setStreamPhase] = useState<"idle" | "generating" | "formatting" | "streaming">("idle");
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState<any>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    loadConversations();
    loadProviders();
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }) => setProfile(data));
  }, [user]);

  useEffect(() => {
    if (activeId) loadMessages(activeId);
    else setMessages([]);
  }, [activeId]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

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

  const newChat = () => { setActiveId(null); setMessages([]); setInput(""); };

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
    const url = `${window.location.origin}/share/${token}`;
    await navigator.clipboard.writeText(url);
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

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    if (!selectedProvider) { toast.error("No models available. Ask an admin to add one."); return; }

    setSending(true);
    setStreamPhase("generating");
    setInput("");
    const formatTimer = setTimeout(() => {
      setStreamPhase(prev => (prev === "generating" ? "formatting" : prev));
    }, 1000);

    let convId = activeId;
    if (!convId) {
      const { data, error } = await supabase.from("conversations").insert({
        user_id: user!.id,
        title: content.slice(0, 60),
        model_id: selectedProvider.id,
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

      if (resp.status === 429) { toast.error("Rate limit. Slow down a touch."); throw new Error("rate"); }
      if (resp.status === 402) { toast.error("Out of credits."); throw new Error("credits"); }
      if (!resp.ok || !resp.body) throw new Error("Failed to stream");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistant = "";
      let done = false;

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
              if (!assistant) setStreamPhase("streaming");
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

      await supabase.from("messages").insert({ conversation_id: convId, role: "assistant", content: assistant });
      loadConversations();
    } catch (e: any) {
      console.error(e);
      if (!["rate", "credits"].includes(e.message)) toast.error("Something went wrong");
    } finally {
      clearTimeout(formatTimer);
      setStreamPhase("idle");
      setSending(false);
    }
  };

  const filtered = conversations.filter(c => c.title.toLowerCase().includes(search.toLowerCase()));
  const badge = roleBadge(roles);
  const displayName = profile?.display_name ?? user?.email?.split("@")[0] ?? "you";

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;

  return (
    <div className="h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="w-72 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col">
        <div className="p-4 flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-warm flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold">Axo<span className="text-gradient">X</span></span>
        </div>

        <div className="px-3">
          <Button variant="hero" className="w-full" onClick={newChat}>
            <Plus className="h-4 w-4" /> New chat
          </Button>
        </div>

        <div className="px-3 mt-3 relative">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search chats…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-xs bg-sidebar-accent border-sidebar-border" />
        </div>

        <div className="flex-1 overflow-y-auto mt-3 px-2">
          {filtered.map(c => (
            <div key={c.id} className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${activeId === c.id ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60 text-sidebar-foreground"}`} onClick={() => setActiveId(c.id)}>
              <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
              <span className="truncate flex-1">{c.title}</span>
              <button onClick={(e) => { e.stopPropagation(); deleteChat(c.id); }} className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground px-3 py-6 text-center">No chats yet.</p>
          )}
        </div>

        <div className="border-t border-sidebar-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-sidebar-accent transition-colors">
                <div className="h-8 w-8 rounded-full bg-gradient-warm flex items-center justify-center text-xs font-semibold text-primary-foreground">
                  {displayName[0]?.toUpperCase()}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="text-sm font-medium truncate">{displayName}</div>
                  <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${badge.cls}`}>
                    {roles.includes("co_founder") && <Crown className="h-2.5 w-2.5" />}
                    {badge.label}
                  </span>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {isAdmin && (
                <DropdownMenuItem asChild><Link to="/admin"><Settings className="h-4 w-4 mr-2" />Admin panel</Link></DropdownMenuItem>
              )}
              <DropdownMenuItem asChild><Link to="/"><Sparkles className="h-4 w-4 mr-2" />Landing page</Link></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut().then(() => navigate("/"))}><LogOut className="h-4 w-4 mr-2" />Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center justify-between px-5 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="rounded-lg gap-2">
                <Zap className="h-3.5 w-3.5 text-primary" />
                {selectedProvider?.display_name ?? "No model"}
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
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{p.provider_type} · {p.model_id}</span>
                  </div>
                </DropdownMenuItem>
              ))}
              {isAdmin && (<>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link to="/admin"><Plus className="h-4 w-4 mr-2" />Add model</Link></DropdownMenuItem>
              </>)}
            </DropdownMenuContent>
          </DropdownMenu>

          {activeId && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => shareChat(activeId)}><Share2 className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="sm" onClick={exportChat}><Download className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="sm" onClick={() => deleteChat(activeId)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          )}
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center px-6">
              <h1 className="font-serif text-4xl md:text-5xl text-center">
                How can I help, <span className="text-gradient">{displayName}</span>?
              </h1>
              <p className="text-muted-foreground mt-3 text-sm">Pick a model and start chatting.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-10 max-w-2xl w-full">
                {PROMPTS.map((p, i) => (
                  <button key={i} onClick={() => send(p.body)} className="text-left p-4 rounded-xl border border-border bg-card/50 hover:bg-card hover:border-primary/40 transition-all">
                    <p.icon className="h-4 w-4 text-primary" />
                    <div className="font-medium text-sm mt-2">{p.title}</div>
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.body}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
              {messages.map((m, i) => (
                <div key={i} className="flex gap-4 animate-fade-in-up">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs shrink-0 ${m.role === "user" ? "bg-secondary" : "bg-gradient-warm text-primary-foreground"}`}>
                    {m.role === "user" ? displayName[0]?.toUpperCase() : <Sparkles className="h-3.5 w-3.5" />}
                  </div>
                  <div className="flex-1 pt-1 prose prose-invert prose-sm max-w-none prose-pre:bg-secondary prose-pre:border prose-pre:border-border">
                    {m.role === "assistant" && !m.content && sending ? (
                      <span className="inline-flex items-center gap-2 text-muted-foreground text-sm">
                        {streamPhase === "formatting" ? "Formatting reply" : "Generating reply"}
                        <span className="inline-flex items-center">
                          <span className="status-dot" /><span className="status-dot" /><span className="status-dot" />
                        </span>
                      </span>
                    ) : (
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 pt-2 shrink-0">
          <div className="max-w-3xl mx-auto relative">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Message AxoX…  (Shift+Enter for new line)"
              rows={1}
              className="resize-none min-h-[56px] max-h-40 pr-14 bg-card border-border rounded-2xl text-sm"
            />
            <Button
              onClick={() => send()}
              disabled={!input.trim() || sending}
              variant="hero"
              size="icon"
              className="absolute right-2 bottom-2 h-10 w-10 rounded-xl"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
