import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Zap, Shield, Users, MessageSquare, Settings2, Terminal, Sun, Moon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";

const Index = () => {
  const { user } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-hero" />

      {/* Nav — Exact-style: centered links, clean */}
      <header className="relative z-10 container flex items-center justify-between py-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-card border border-border flex items-center justify-center">
            <Terminal className="h-4 w-4 text-foreground" />
          </div>
          <span className="font-semibold tracking-tight">AxoX</span>
        </div>
        <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
          <a href="#about" className="hover:text-foreground transition-colors">About</a>
          <a href="#features" className="hover:text-foreground transition-colors">Features</a>
          <a href="#models" className="hover:text-foreground transition-colors">Models</a>
          <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          {user ? (
            <Button asChild variant="default" className="rounded-full bg-foreground text-background hover:bg-foreground/90"><Link to="/chat">Open chat</Link></Button>
          ) : (
            <Button asChild variant="default" className="rounded-full bg-foreground text-background hover:bg-foreground/90"><Link to="/auth?mode=signup">Get Started</Link></Button>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 container pt-20 pb-16 text-center">
        <h1 className="font-serif text-6xl md:text-8xl leading-[1.02] tracking-tight animate-fade-in-up">
          Chat with <em className="not-italic text-gradient">exact</em> intelligence.
        </h1>
        <p className="mt-7 max-w-xl mx-auto text-base md:text-lg text-muted-foreground animate-fade-in-up">
          The AI-native chat that gets it exactly right.
          <br />No clutter. No waiting. Just perfect replies, every time.
        </p>

        <div className="mt-10 flex items-center justify-center gap-3 animate-fade-in-up">
          <Button asChild size="lg" className="rounded-full bg-foreground text-background hover:bg-foreground/90 px-6">
            <Link to={user ? "/chat" : "/auth?mode=signup"}>Start chatting</Link>
          </Button>
          <Button asChild variant="ghost" size="lg" className="rounded-full px-6">
            <a href="#features">Discover product <ArrowRight className="h-4 w-4 ml-1" /></a>
          </Button>
        </div>

        {/* Demo card */}
        <div id="about" className="mt-20 max-w-4xl mx-auto rounded-2xl border border-border bg-card/70 backdrop-blur shadow-soft overflow-hidden text-left animate-fade-in-up">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/40">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
              <span className="ml-3 text-xs text-muted-foreground">axox.chat</span>
            </div>
            <span className="text-[10px] text-muted-foreground tracking-wider">LLAMA‑3.3‑70B</span>
          </div>
          <div className="p-8 space-y-5 text-sm">
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
      <section id="features" className="relative z-10 container py-24">
        <div className="text-xs text-muted-foreground tracking-wider mb-3">{"// Core features"}</div>
        <h2 className="font-serif text-4xl md:text-6xl leading-[1.05]">
          Chat with precision.
          <br /><span className="text-muted-foreground/70">Stream with confidence.</span>
        </h2>

        <div className="grid md:grid-cols-3 gap-4 mt-14">
          {[
            { icon: Zap, title: "Stupidly fast", body: "Groq inference + your own AxoX nodes. Tokens stream the moment they're born." },
            { icon: Shield, title: "Yours, privately", body: "Bring your own models. Keys never leave the server. RLS on every row." },
            { icon: Users, title: "Roles that matter", body: "Members, premium, specials, admins, co‑founders — gated cleanly." },
            { icon: MessageSquare, title: "Export & share", body: "Markdown export. One‑click share links. Delete in a tap." },
            { icon: Settings2, title: "Admin panel", body: "Add Groq or AxoX models in seconds. Manage who sees what." },
            { icon: Sparkles, title: "Smooth, always", body: "Designed like a love letter to keyboards and night owls." },
          ].map((f, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card/40 p-6 hover:bg-card hover:border-border/80 transition-all">
              <f.icon className="h-5 w-5 text-foreground/80" />
              <h3 className="mt-5 font-medium">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Models */}
      <section id="models" className="relative z-10 container py-24">
        <div className="text-xs text-muted-foreground tracking-wider mb-3">{"// Models"}</div>
        <h2 className="font-serif text-4xl md:text-6xl leading-[1.05]">
          One chat. <span className="text-muted-foreground/70">Every model.</span>
        </h2>
        <div className="grid md:grid-cols-2 gap-4 mt-12">
          <div className="rounded-2xl border border-border bg-card/40 p-8">
            <div className="text-[10px] tracking-widest text-muted-foreground">GROQ</div>
            <div className="font-serif text-3xl mt-2">Llama 3.3 70B</div>
            <p className="text-sm text-muted-foreground mt-3">Lightning-fast inference on Groq's LPU. Sub-second replies for everyday chat.</p>
          </div>
          <div className="rounded-2xl border border-border bg-card/40 p-8">
            <div className="text-[10px] tracking-widest text-muted-foreground">AXOX NODES</div>
            <div className="font-serif text-3xl mt-2">Qwen 2.5 14B</div>
            <p className="text-sm text-muted-foreground mt-3">Your own private nodes. Keys never leave the server. Bring any Ollama model.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="faq" className="relative z-10 container py-24 text-center">
        <h2 className="font-serif text-5xl md:text-6xl">Ready when you are.</h2>
        <p className="mt-4 text-muted-foreground">Free forever. No card. No spam.</p>
        <div className="mt-8">
          <Button asChild size="lg" className="rounded-full bg-foreground text-background hover:bg-foreground/90 px-7">
            <Link to={user ? "/chat" : "/auth?mode=signup"}>Start chatting <ArrowRight className="h-4 w-4 ml-1" /></Link>
          </Button>
        </div>
      </section>

      <footer className="relative z-10 container py-10 text-center text-xs text-muted-foreground border-t border-border">
        © {new Date().getFullYear()} AxoX — quiet, fast, yours.
      </footer>
    </div>
  );
};

export default Index;
