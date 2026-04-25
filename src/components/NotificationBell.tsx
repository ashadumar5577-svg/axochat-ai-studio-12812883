import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";

type Notif = { id: string; title: string; body: string; link: string | null; read: boolean; created_at: string };

export function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data ?? []) as Notif[]);
  };

  useEffect(() => {
    if (!user) return;
    load();
    const channel = supabase
      .channel(`notifs-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const unread = items.filter(i => !i.read).length;

  const markAllRead = async () => {
    if (!user || unread === 0) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    load();
  };

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) markAllRead(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="font-medium text-sm">Notifications</span>
          <span className="text-xs text-muted-foreground">{items.length}</span>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">No notifications yet</p>
          )}
          {items.map(n => {
            const inner = (
              <div className={`px-4 py-3 border-b border-border/60 hover:bg-secondary/50 ${!n.read ? "bg-primary/5" : ""}`}>
                <div className="text-sm font-medium">{n.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{n.body}</div>
                <div className="text-[10px] text-muted-foreground/70 mt-1">{new Date(n.created_at).toLocaleString()}</div>
              </div>
            );
            return n.link ? (
              <Link key={n.id} to={n.link} onClick={() => setOpen(false)}>{inner}</Link>
            ) : (
              <div key={n.id}>{inner}</div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
