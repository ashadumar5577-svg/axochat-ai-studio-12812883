import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trash2, Plus, Sun, Moon, Monitor } from "lucide-react";
import { toast } from "sonner";

type Memory = { id: string; content: string; created_at: string };

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [newMem, setNewMem] = useState("");

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_memories")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setMemories((data ?? []) as Memory[]);
  };

  useEffect(() => { if (open) load(); }, [open, user]);

  const addMemory = async () => {
    const c = newMem.trim();
    if (!c || !user) return;
    const { error } = await supabase.from("user_memories").insert({ user_id: user.id, content: c });
    if (error) return toast.error(error.message);
    setNewMem("");
    toast.success("Memory saved");
    load();
  };

  const removeMemory = async (id: string) => {
    await supabase.from("user_memories").delete().eq("id", id);
    load();
  };

  const clearAll = async () => {
    if (!user || !memories.length) return;
    if (!confirm("Delete all memories? AxoX will forget everything.")) return;
    await supabase.from("user_memories").delete().eq("user_id", user.id);
    toast.success("All memories cleared");
    load();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Settings</DialogTitle></DialogHeader>
        <Tabs defaultValue="memory">
          <TabsList>
            <TabsTrigger value="memory">Personalization</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
          </TabsList>

          <TabsContent value="memory" className="space-y-4">
            <div>
              <h3 className="text-sm font-medium">Memory</h3>
              <p className="text-xs text-muted-foreground mt-1">
                AxoX remembers what you share to give better answers. Manage what it knows here.
              </p>
            </div>
            <div className="flex gap-2">
              <Input
                value={newMem}
                onChange={e => setNewMem(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addMemory(); }}
                placeholder="e.g. I'm a software engineer who loves TypeScript"
              />
              <Button onClick={addMemory} disabled={!newMem.trim()}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="max-h-80 overflow-y-auto rounded-lg border border-border divide-y divide-border">
              {memories.length === 0 && (
                <p className="text-xs text-muted-foreground p-6 text-center">No memories yet. Things AxoX learns about you will appear here.</p>
              )}
              {memories.map(m => (
                <div key={m.id} className="flex items-start gap-3 p-3 group">
                  <p className="flex-1 text-sm">{m.content}</p>
                  <button onClick={() => removeMemory(m.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {memories.length > 0 && (
              <Button variant="outline" size="sm" onClick={clearAll} className="text-destructive">Clear all memories</Button>
            )}
          </TabsContent>

          <TabsContent value="general" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Theme</div>
                <div className="text-xs text-muted-foreground">{theme === "dark" ? "Dark" : "Light"}</div>
              </div>
              <Button variant="outline" size="sm" onClick={toggle} className="gap-2">
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {theme === "dark" ? "Light" : "Dark"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="account" className="space-y-4">
            <div>
              <div className="text-xs text-muted-foreground">Signed in as</div>
              <div className="text-sm font-medium">{user?.email}</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => signOut()}>Sign out</Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
