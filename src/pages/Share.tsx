import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MessageContent } from "@/components/MessageContent";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Share() {
  const { token } = useParams();
  const [conv, setConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: c } = await supabase.from("conversations").select("*").eq("share_token", token).maybeSingle();
      setConv(c);
      if (c) {
        const { data: m } = await supabase.from("messages").select("*").eq("conversation_id", c.id).order("created_at");
        setMessages(m ?? []);
      }
      setLoading(false);
    })();
  }, [token]);

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading…</div>;
  if (!conv) return <div className="min-h-screen grid place-items-center"><p className="text-muted-foreground">Shared chat not found.</p></div>;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="container flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-warm flex items-center justify-center"><Sparkles className="h-4 w-4 text-primary-foreground" /></div>
            <span className="font-semibold">Axo<span className="text-gradient">X</span></span>
          </Link>
          <Button asChild variant="hero" size="sm"><Link to="/auth?mode=signup">Try AxoX free</Link></Button>
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="font-serif text-3xl mb-2">{conv.title}</h1>
        <p className="text-xs text-muted-foreground mb-8">Shared conversation</p>
        <div className="space-y-6">
          {messages.map((m, i) => (
            <div key={i} className="flex gap-4">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs shrink-0 ${m.role === "user" ? "bg-secondary" : "bg-gradient-warm text-primary-foreground"}`}>
                {m.role === "user" ? "U" : <Sparkles className="h-3.5 w-3.5" />}
              </div>
              <div className="flex-1 prose prose-invert prose-sm max-w-none"><MessageContent content={m.content} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
