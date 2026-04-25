import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, Check, Database, Rocket, ShieldCheck } from "lucide-react";

export type Plan = { id: string; name: string; price: number };

const PAY_METHODS = ["UPI", "Crypto", "Bank Transfer", "Easy Paisa", "Jazz Cash", "Other"];

type Phase = "launch" | "connect" | "form" | "confirm" | "submitting" | "done";

export function PurchaseFlow({
  plan,
  open,
  onOpenChange,
}: {
  plan: Plan | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("launch");
  const [form, setForm] = useState({
    full_name: "",
    date_of_birth: "",
    phone: "",
    contact_email: "",
    payment_method: "UPI",
    other_method: "",
  });

  useEffect(() => {
    if (!open) return;
    setPhase("launch");
    setForm({
      full_name: "",
      date_of_birth: "",
      phone: "",
      contact_email: user?.email ?? "",
      payment_method: "UPI",
      other_method: "",
    });
    const t1 = setTimeout(() => setPhase("connect"), 1100);
    const t2 = setTimeout(() => setPhase("form"), 2300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [open, user]);

  const submit = async () => {
    if (!plan || !user) return;
    if (!form.full_name || !form.date_of_birth || !form.phone || !form.contact_email) {
      toast.error("Please fill all fields");
      return;
    }
    setPhase("submitting");
    const method = form.payment_method === "Other" ? `Other: ${form.other_method || "unspecified"}` : form.payment_method;
    const { error } = await supabase.from("orders").insert({
      user_id: user.id,
      plan: plan.name,
      price_usd: plan.price,
      full_name: form.full_name,
      date_of_birth: form.date_of_birth,
      phone: form.phone,
      contact_email: form.contact_email,
      payment_method: method,
    });
    if (error) {
      setPhase("form");
      toast.error(error.message);
      return;
    }
    setPhase("done");
  };

  const close = () => {
    onOpenChange(false);
    setTimeout(() => setPhase("launch"), 300);
  };

  if (!plan) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-md">
        {phase === "launch" && (
          <div className="py-12 text-center space-y-4 animate-fade-in-up">
            <Rocket className="h-10 w-10 mx-auto text-primary" />
            <h2 className="font-serif text-3xl">Launching Order!</h2>
            <p className="text-sm text-muted-foreground">{plan.name} — ${plan.price}/mo</p>
          </div>
        )}

        {phase === "connect" && (
          <div className="py-12 text-center space-y-4 animate-fade-in-up">
            <Database className="h-10 w-10 mx-auto text-primary" />
            <h2 className="font-serif text-2xl">Connecting to Database…</h2>
            <div className="flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          </div>
        )}

        {phase === "form" && (
          <div className="space-y-4 animate-fade-in-up">
            <div>
              <h2 className="font-serif text-2xl">Order details</h2>
              <p className="text-xs text-muted-foreground mt-1">{plan.name} · ${plan.price}/mo</p>
            </div>
            <div className="space-y-3">
              <div>
                <Label>Your name</Label>
                <Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="Jane Doe" />
              </div>
              <div>
                <Label>Date of birth</Label>
                <Input type="date" value={form.date_of_birth} onChange={e => setForm({ ...form, date_of_birth: e.target.value })} />
              </div>
              <div>
                <Label>Phone (for contact)</Label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+1 555 0100" />
              </div>
              <div>
                <Label>Email (for contact)</Label>
                <Input type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} />
              </div>
              <div>
                <Label>Payment method</Label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {PAY_METHODS.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setForm({ ...form, payment_method: m })}
                      className={`text-xs px-2 py-2 rounded-lg border transition-all ${form.payment_method === m ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card/50 text-muted-foreground hover:bg-card"}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                {form.payment_method === "Other" && (
                  <Input
                    className="mt-2"
                    placeholder="Specify your method"
                    value={form.other_method}
                    onChange={e => setForm({ ...form, other_method: e.target.value })}
                  />
                )}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="ghost" className="flex-1" onClick={close}>Cancel</Button>
              <Button className="flex-1 rounded-full bg-foreground text-background hover:bg-foreground/90" onClick={() => setPhase("confirm")}>Continue</Button>
            </div>
          </div>
        )}

        {phase === "confirm" && (
          <div className="py-6 text-center space-y-5 animate-fade-in-up">
            <ShieldCheck className="h-10 w-10 mx-auto text-primary" />
            <h2 className="font-serif text-2xl">Are you sure?</h2>
            <p className="text-sm text-muted-foreground">Proceed with this order for <span className="text-foreground font-medium">{plan.name}</span> at <span className="text-foreground font-medium">${plan.price}/mo</span>?</p>
            <div className="flex gap-2 pt-2">
              <Button variant="ghost" className="flex-1" onClick={() => setPhase("form")}>Back</Button>
              <Button className="flex-1 rounded-full bg-foreground text-background hover:bg-foreground/90" onClick={submit}>Yes, place order</Button>
            </div>
          </div>
        )}

        {phase === "submitting" && (
          <div className="py-12 text-center space-y-3">
            <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Placing order…</p>
          </div>
        )}

        {phase === "done" && (
          <div className="py-10 text-center space-y-4 animate-fade-in-up">
            <div className="h-14 w-14 mx-auto rounded-full bg-primary/15 grid place-items-center">
              <Check className="h-7 w-7 text-primary" />
            </div>
            <h2 className="font-serif text-2xl">Order Placed</h2>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              The Admin or Owner will contact you soon.<br />Thanks for choosing AxoX.
            </p>
            <div className="flex gap-2 pt-2">
              <Button variant="ghost" className="flex-1" onClick={() => { close(); navigate("/chat"); }}>Open chat</Button>
              <Button className="flex-1 rounded-full bg-foreground text-background hover:bg-foreground/90" onClick={close}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
