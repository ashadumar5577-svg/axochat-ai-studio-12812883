import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Plus, Sparkles, Trash2, Crown, Shield, Star, Zap } from "lucide-react";
import { toast } from "sonner";

const ROLES = ["co_founder", "admin", "special", "premium", "member"] as const;

const PRESETS: Record<string, { display_name: string; model_id: string; base_url: string; auth_header: "bearer" | "x-api-key" }[]> = {
  groq: [
    { display_name: "Llama 3.3 70B", model_id: "llama-3.3-70b-versatile", base_url: "https://api.groq.com/openai/v1", auth_header: "bearer" },
    { display_name: "GPT‑OSS 20B", model_id: "openai/gpt-oss-20b", base_url: "https://api.groq.com/openai/v1", auth_header: "bearer" },
    { display_name: "Qwen 3 32B", model_id: "qwen/qwen3-32b", base_url: "https://api.groq.com/openai/v1", auth_header: "bearer" },
  ],
  axox: [
    { display_name: "AxoX v1", model_id: "qwen2.5:14b", base_url: "http://ai-v1.axonodes.fun:5000/v1", auth_header: "bearer" },
    { display_name: "AxoX v2", model_id: "qwen2.5:14b", base_url: "http://ai-v2.axonodes.fun:11434/v1", auth_header: "x-api-key" },
  ],
};

export default function Admin() {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [providers, setProviders] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [providerType, setProviderType] = useState<"groq" | "axox">("groq");
  const [form, setForm] = useState({ display_name: "", model_id: "", base_url: "", api_key: "", auth_header: "bearer" as "bearer" | "x-api-key", min_role: "member" });

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) navigate("/", { replace: true });
  }, [user, loading, isAdmin, navigate]);

  useEffect(() => { if (isAdmin) { loadAll(); } }, [isAdmin]);

  const loadAll = async () => {
    const [p, profs, ur] = await Promise.all([
      supabase.from("ai_providers").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("*"),
      supabase.from("user_roles").select("*"),
    ]);
    setProviders(p.data ?? []);
    const merged = (profs.data ?? []).map((u: any) => ({
      ...u, roles: (ur.data ?? []).filter((r: any) => r.user_id === u.id).map((r: any) => r.role),
    }));
    setUsers(merged);
  };

  const applyPreset = (idx: number) => {
    const preset = PRESETS[providerType][idx];
    if (preset) setForm(f => ({ ...f, ...preset }));
  };

  const addProvider = async () => {
    if (!form.display_name || !form.model_id || !form.base_url || !form.api_key) {
      return toast.error("Fill all fields");
    }
    const { error } = await supabase.from("ai_providers").insert({
      provider_type: providerType,
      display_name: form.display_name,
      model_id: form.model_id,
      base_url: form.base_url,
      api_key: form.api_key,
      auth_header: form.auth_header,
      min_role: form.min_role as any,
      enabled: true,
    });
    if (error) return toast.error(error.message);
    toast.success("Model added");
    setOpen(false);
    setForm({ display_name: "", model_id: "", base_url: "", api_key: "", auth_header: "bearer", min_role: "member" });
    loadAll();
  };

  const toggleProvider = async (id: string, enabled: boolean) => {
    await supabase.from("ai_providers").update({ enabled: !enabled }).eq("id", id);
    loadAll();
  };

  const deleteProvider = async (id: string) => {
    await supabase.from("ai_providers").delete().eq("id", id);
    loadAll();
  };

  const setUserRole = async (userId: string, role: string, currentRoles: string[]) => {
    // remove existing main roles, set new one
    await supabase.from("user_roles").delete().eq("user_id", userId);
    await supabase.from("user_roles").insert({ user_id: userId, role: role as any });
    toast.success("Role updated");
    loadAll();
  };

  if (loading || !isAdmin) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="sm"><Link to="/chat"><ArrowLeft className="h-4 w-4" /> Back</Link></Button>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-semibold">Admin panel</span>
            </div>
          </div>
        </div>
      </header>

      <div className="container py-10">
        <Tabs defaultValue="models">
          <TabsList>
            <TabsTrigger value="models">Models</TabsTrigger>
            <TabsTrigger value="users">Users & Roles</TabsTrigger>
          </TabsList>

          <TabsContent value="models" className="mt-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-serif text-3xl">AI Models</h2>
                <p className="text-sm text-muted-foreground">Add Groq or AxoX node endpoints.</p>
              </div>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button variant="hero"><Plus className="h-4 w-4" /> Add model</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add AI model</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Provider</Label>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {(["groq", "axox"] as const).map(t => (
                          <button key={t} onClick={() => setProviderType(t)} className={`p-4 rounded-xl border text-left transition-all ${providerType === t ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                            <Zap className={`h-4 w-4 ${providerType === t ? "text-primary" : "text-muted-foreground"}`} />
                            <div className="font-medium mt-2">{t === "groq" ? "Groq" : "AxoX node"}</div>
                            <div className="text-xs text-muted-foreground">{t === "groq" ? "OpenAI-compatible API" : "Your private nodes"}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label>Quick preset</Label>
                      <div className="grid gap-2 mt-2">
                        {PRESETS[providerType].map((p, i) => (
                          <button key={i} onClick={() => applyPreset(i)} className="text-left p-2 rounded-lg border border-border bg-card/50 hover:bg-card text-sm">
                            <span className="font-medium">{p.display_name}</span>
                            <span className="text-xs text-muted-foreground ml-2">{p.model_id}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Display name</Label><Input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} /></div>
                      <div><Label>Model ID</Label><Input value={form.model_id} onChange={e => setForm({ ...form, model_id: e.target.value })} /></div>
                    </div>
                    <div><Label>Base URL</Label><Input value={form.base_url} onChange={e => setForm({ ...form, base_url: e.target.value })} placeholder="https://api.groq.com/openai/v1" /></div>
                    <div><Label>API Key</Label><Input type="password" value={form.api_key} onChange={e => setForm({ ...form, api_key: e.target.value })} placeholder={providerType === "groq" ? "gsk_..." : "axo_..."} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Auth header</Label>
                        <Select value={form.auth_header} onValueChange={(v: any) => setForm({ ...form, auth_header: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bearer">Authorization: Bearer</SelectItem>
                            <SelectItem value="x-api-key">X-API-Key</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Minimum role</Label>
                        <Select value={form.min_role} onValueChange={v => setForm({ ...form, min_role: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  <DialogFooter><Button variant="hero" onClick={addProvider}>Add model</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid gap-3">
              {providers.map(p => (
                <div key={p.id} className="rounded-xl border border-border bg-card/50 p-4 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.display_name}</span>
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{p.provider_type}</span>
                      {!p.enabled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive">disabled</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 truncate">{p.model_id} · {p.base_url}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => toggleProvider(p.id, p.enabled)}>{p.enabled ? "Disable" : "Enable"}</Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteProvider(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ))}
              {providers.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">No models yet. Add one to start chatting.</p>}
            </div>
          </TabsContent>

          <TabsContent value="users" className="mt-6">
            <h2 className="font-serif text-3xl mb-6">Members</h2>
            <div className="grid gap-3">
              {users.map(u => (
                <div key={u.id} className="rounded-xl border border-border bg-card/50 p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{u.display_name ?? u.email}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </div>
                  <Select value={u.roles[0] ?? "member"} onValueChange={(v) => setUserRole(u.id, v, u.roles)}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r.replace("_", " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
