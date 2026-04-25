import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { CheckCircle2, XCircle, Clock, Trash2, Mail } from "lucide-react";

type Order = {
  id: string;
  user_id: string;
  plan: string;
  price_usd: number;
  full_name: string;
  date_of_birth: string;
  phone: string;
  contact_email: string;
  payment_method: string;
  status: "pending" | "confirmed" | "declined" | "dumped";
  decline_reason: string | null;
  admin_message: string | null;
  created_at: string;
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-500",
  confirmed: "bg-emerald-500/15 text-emerald-500",
  declined: "bg-destructive/15 text-destructive",
  dumped: "bg-muted text-muted-foreground",
};

export function AdminOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<"all" | Order["status"]>("all");
  const [declineFor, setDeclineFor] = useState<Order | null>(null);
  const [reason, setReason] = useState("");
  const [msgFor, setMsgFor] = useState<Order | null>(null);
  const [message, setMessage] = useState("");

  const load = async () => {
    const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    setOrders((data ?? []) as Order[]);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("orders-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const setStatus = async (o: Order, status: Order["status"], extra: Partial<Order> = {}) => {
    const { error } = await supabase.from("orders")
      .update({ status, handled_by: user?.id, ...extra })
      .eq("id", o.id);
    if (error) return toast.error(error.message);

    // Notify the user about the status change
    const titleMap: Record<string, string> = {
      confirmed: "Order confirmed ✓",
      declined: "Order declined",
      pending: "Order set to pending",
      dumped: "Order removed",
    };
    const bodyMap: Record<string, string> = {
      confirmed: `Your ${o.plan} order was confirmed. We'll be in touch.`,
      declined: `Your ${o.plan} order was declined. Reason: ${extra.decline_reason ?? "—"}`,
      pending: `Your ${o.plan} order is now pending review.`,
      dumped: `Your ${o.plan} order was dumped.`,
    };
    await supabase.from("notifications").insert({
      user_id: o.user_id,
      title: titleMap[status],
      body: bodyMap[status],
    });
    toast.success(`Order ${status}`);
    load();
  };

  const deleteOrder = async (o: Order) => {
    if (!confirm("Permanently delete this order?")) return;
    await supabase.from("orders").delete().eq("id", o.id);
    toast.success("Deleted");
    load();
  };

  const sendMessage = async () => {
    if (!msgFor || !message.trim()) return;
    await supabase.from("orders").update({ admin_message: message }).eq("id", msgFor.id);
    await supabase.from("notifications").insert({
      user_id: msgFor.user_id,
      title: `Message from AxoX team`,
      body: message,
    });
    toast.success("Message sent");
    setMsgFor(null);
    setMessage("");
    load();
  };

  const submitDecline = () => {
    if (!declineFor || !reason.trim()) return toast.error("Reason required");
    setStatus(declineFor, "declined", { decline_reason: reason });
    setDeclineFor(null);
    setReason("");
  };

  const filtered = filter === "all" ? orders : orders.filter(o => o.status === filter);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-serif text-3xl">Orders</h2>
          <p className="text-sm text-muted-foreground">All purchase requests across the platform.</p>
        </div>
        <div className="flex gap-1.5">
          {(["all", "pending", "confirmed", "declined", "dumped"] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filter === s ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card/50 text-muted-foreground hover:bg-card"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-12">No orders.</p>
        )}
        {filtered.map(o => (
          <div key={o.id} className="rounded-xl border border-border bg-card/50 p-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{o.full_name}</span>
                  <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${STATUS_STYLES[o.status]}`}>{o.status}</span>
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{o.plan} · ${o.price_usd}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1.5 grid sm:grid-cols-2 gap-x-4 gap-y-0.5">
                  <span>📧 {o.contact_email}</span>
                  <span>📱 {o.phone}</span>
                  <span>🎂 {o.date_of_birth}</span>
                  <span>💳 {o.payment_method}</span>
                </div>
                {o.decline_reason && <div className="text-xs text-destructive mt-2">Reason: {o.decline_reason}</div>}
                {o.admin_message && <div className="text-xs text-primary mt-2">Last message: {o.admin_message}</div>}
                <div className="text-[10px] text-muted-foreground/60 mt-1.5">{new Date(o.created_at).toLocaleString()}</div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setStatus(o, "confirmed")} className="h-8"><CheckCircle2 className="h-3.5 w-3.5" /> Confirm</Button>
                <Button size="sm" variant="outline" onClick={() => { setDeclineFor(o); setReason(""); }} className="h-8"><XCircle className="h-3.5 w-3.5" /> Decline</Button>
                <Button size="sm" variant="outline" onClick={() => setStatus(o, "pending")} className="h-8"><Clock className="h-3.5 w-3.5" /> Pending</Button>
                <Button size="sm" variant="outline" onClick={() => setStatus(o, "dumped")} className="h-8">Dump</Button>
                <Button size="sm" variant="outline" onClick={() => { setMsgFor(o); setMessage(""); }} className="h-8"><Mail className="h-3.5 w-3.5" /> Email</Button>
                <Button size="sm" variant="ghost" onClick={() => deleteOrder(o)} className="h-8"><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Decline reason dialog */}
      <Dialog open={!!declineFor} onOpenChange={(v) => !v && setDeclineFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Decline order</DialogTitle></DialogHeader>
          <Label>Reason (required)</Label>
          <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} placeholder="Tell the customer why this was declined…" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeclineFor(null)}>Cancel</Button>
            <Button onClick={submitDecline}>Decline</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Message user dialog */}
      <Dialog open={!!msgFor} onOpenChange={(v) => !v && setMsgFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Message {msgFor?.full_name}</DialogTitle></DialogHeader>
          <Label>Message</Label>
          <Textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} placeholder="Hi! Following up on your order…" />
          <p className="text-xs text-muted-foreground">Sent as an in-app notification to the user.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMsgFor(null)}>Cancel</Button>
            <Button onClick={sendMessage}>Send</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
