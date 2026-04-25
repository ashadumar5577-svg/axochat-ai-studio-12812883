import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Zap, Shield, Users, MessageSquare, Settings2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const Index = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Hero glow */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-hero" />

      {/* Nav */}
      <header className="relative z-10 container flex items-center justify-between py-6">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-gradient-warm flex items-center justify-center shadow-glow">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-lg tracking-tight">Axo<span className="text-gradient">X</span></span>
        </div>
        <nav className="flex items-center gap-2">
          {user ? (
            <Button asChild variant="hero"><Link to="/chat">Open chat <ArrowRight className="h-4 w-4" /></Link></Button>
          ) : (
            <>
              <Button asChild variant="ghost"><Link to="/auth">Sign in</Link></Button>
              <Button asChild variant="hero"><Link to="/auth?mode=signup">Try it free</Link></Button>
            </>
          )}
        </nav>
      </header>

      {/* Hero */}
      <section className="relative z-10 container pt-16 pb-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 backdrop-blur px-4 py-1.5 text-xs text-muted-foreground animate-fade-in-up">
          <span className="h-1.5 w-1.5 rounded-full bg-gradient-warm" />
          Now streaming on Groq + private AxoX nodes
        </div>

        <h1 className="font-serif text-6xl md:text-8xl mt-8 leading-[1.05] tracking-tight animate-fade-in-up">
          Conversations,
          <br />
          <em className="not-italic text-foreground/80">but at the speed of</em>
          <br />
          <span className="text-gradient italic">thought.</span>
        </h1>

        <p className="mt-8 max-w-xl mx-auto text-base md:text-lg text-muted-foreground animate-fade-in-up">
          AxoX is a quiet, fast home for talking to the AI models you actually love —
          Llama, Qwen, GPT‑OSS, and your own private nodes. No clutter. No waiting.
        </p>

        <div className="mt-10 flex items-center justify-center gap-4 animate-fade-in-up">
          <Button asChild variant="hero" size="lg">
            <Link to={user ? "/chat" : "/auth?mode=signup"}>Start a conversation <ArrowRight className="h-4 w-4" /></Link>
          </Button>
          <Button asChild variant="ghost" size="lg"><a href="#why">Why AxoX?</a></Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Free forever. No card. No spam.</p>

        {/* Demo card */}
        <div className="mt-20 max-w-3xl mx-auto rounded-2xl border border-border bg-card/70 backdrop-blur shadow-soft overflow-hidden text-left animate-fade-in-up">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/40">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-primary/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
              <span className="ml-3 text-xs text-muted-foreground">axox.chat</span>
            </div>
            <span className="text-[10px] text-muted-foreground tracking-wider">LLAMA‑3.3‑70B</span>
          </div>
          <div className="p-6 space-y-5 text-sm">
            <div className="flex gap-3">
              <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center text-xs">A</div>
              <p className="pt-1 text-muted-foreground">what's the actual difference between an llm and an agent?</p>
            </div>
            <div className="flex gap-3">
              <div className="h-7 w-7 rounded-full bg-gradient-warm flex items-center justify-center text-xs text-primary-foreground">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <p className="pt-1 text-foreground/90">
                An LLM is the brain — it predicts the next token. An <em className="text-primary">agent</em> wraps that brain
                with goals, memory, and tools, so it can actually <em>do</em> things, not just describe them.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="why" className="relative z-10 container py-24">
        <h2 className="font-serif text-4xl md:text-5xl text-center">Built different.</h2>
        <div className="grid md:grid-cols-3 gap-5 mt-12">
          {[
            { icon: Zap, title: "Stupidly fast", body: "Groq inference + your own AxoX nodes. Tokens stream the moment they're born." },
            { icon: Shield, title: "Yours, privately", body: "Bring your own models. Keys never leave the server. RLS on every row." },
            { icon: Users, title: "Roles that matter", body: "Members, premium, specials, admins, co‑founders — gated cleanly." },
            { icon: MessageSquare, title: "Export & share", body: "Markdown export. One‑click share links. Delete in a tap." },
            { icon: Settings2, title: "Admin panel", body: "Add Groq or AxoX models in seconds. Manage who sees what." },
            { icon: Sparkles, title: "Smooth, always", body: "Designed like a love letter to keyboards and night owls." },
          ].map((f, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card/50 p-6 hover:bg-card transition-colors">
              <f.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 container py-10 text-center text-xs text-muted-foreground border-t border-border">
        © {new Date().getFullYear()} AxoX — quiet, fast, yours.
      </footer>
    </div>
  );
};

export default Index;
