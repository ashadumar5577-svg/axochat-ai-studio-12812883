import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sun, Moon, Check, Sparkles, Brain, Zap, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { PurchaseFlow, type Plan } from "@/components/PurchaseFlow";

const PLANS: (Plan & { tagline: string; features: string[]; highlight?: boolean })[] = [
  { id: "free", name: "Free", price: 0, tagline: "Get started", features: ["Access to AxoX base model", "Standard response speed", "Memory across chats", "Web app access"] },
  { id: "pro", name: "Axo Pro", price: 12, tagline: "For power users", highlight: true, features: ["Everything in Free", "Access to advanced models", "Faster responses", "Higher message limits", "Priority during peak hours"] },
  { id: "plus", name: "Axo+", price: 30, tagline: "Unlimited", features: ["Everything in Pro", "Unlimited messages", "Earliest model access", "Direct founder support"] },
];

const Index = () => {
  const { user } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [purchase, setPurchase] = useState<Plan | null>(null);

  const startPurchase = (plan: Plan) => {
    if (!user) { navigate("/auth?mode=signup"); return; }
    if (plan.price === 0) { navigate("/chat"); return; }
    setPurchase(plan);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-20 backdrop-blur bg-background/80 border-b border-border">
        <div className="container flex items-center justify-between py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-foreground text-background grid place-items-center text-xs font-semibold">A</div>
            <span className="font-semibold tracking-tight">AxoX</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#team" className="hover:text-foreground transition-colors">Team</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            {user ? (
              <Button asChild className="rounded-full bg-foreground text-background hover:bg-foreground/85">
                <Link to="/chat">Open AxoX</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" className="rounded-full hidden sm:inline-flex"><Link to="/auth">Log in</Link></Button>
                <Button asChild className="rounded-full bg-foreground text-background hover:bg-foreground/85">
                  <Link to="/auth?mode=signup">Sign up</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container py-20 md:py-28 text-center">
        <h1 className="font-serif text-5xl md:text-7xl tracking-tight leading-[1.05] animate-fade-in-up">
          The AI that <em className="not-italic underline decoration-2 underline-offset-8">remembers</em>.
        </h1>
        <p className="mt-6 max-w-xl mx-auto text-base md:text-lg text-muted-foreground">
          A fast, focused chat that gets smarter the more you use it. Built for clarity. Made to help.
        </p>
        <div className="mt-9 flex items-center justify-center gap-3">
          <Button asChild size="lg" className="rounded-full bg-foreground text-background hover:bg-foreground/85 px-6 h-12">
            <Link to={user ? "/chat" : "/auth?mode=signup"}>
              Start chatting <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-full px-6 h-12">
            <a href="#features">Learn more</a>
          </Button>
        </div>

        {/* Demo card */}
        <div className="mt-16 max-w-2xl mx-auto rounded-2xl border border-border bg-secondary/30 shadow-soft overflow-hidden text-left">
          <div className="px-5 py-6 space-y-5 text-sm">
            <div className="flex justify-end">
              <div className="bg-background border border-border rounded-2xl px-4 py-2">remember I love minimal design</div>
            </div>
            <div className="flex gap-3">
              <div className="h-6 w-6 rounded-full bg-foreground text-background grid place-items-center text-[10px] font-semibold shrink-0">A</div>
              <p className="pt-0.5 text-foreground/90">Got it — I'll keep that in mind. Want me to suggest some minimal design resources?</p>
            </div>
            <div className="flex justify-end">
              <div className="bg-background border border-border rounded-2xl px-4 py-2">later: design me a landing page</div>
            </div>
            <div className="flex gap-3">
              <div className="h-6 w-6 rounded-full bg-foreground text-background grid place-items-center text-[10px] font-semibold shrink-0">A</div>
              <p className="pt-0.5 text-foreground/90">Since you love minimal design, I'll keep it clean — generous whitespace, one accent, no clutter…</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="container py-24">
        <h2 className="font-serif text-3xl md:text-5xl tracking-tight text-center">Built for thinking.</h2>
        <p className="text-center text-muted-foreground mt-3 max-w-lg mx-auto">Everything you need in a modern AI chat. Nothing you don't.</p>
        <div className="grid md:grid-cols-2 gap-3 mt-12 max-w-3xl mx-auto">
          {[
            { icon: Brain, title: "Memory", body: "AxoX remembers facts you share so every chat picks up where the last left off." },
            { icon: Zap, title: "Fast", body: "Streaming responses the moment they're generated. No waiting around." },
            { icon: Sparkles, title: "Multiple models", body: "Switch between models per chat. Use the right brain for the job." },
            { icon: Lock, title: "Private", body: "Your chats are yours. Strict row-level security on every message." },
          ].map((f, i) => (
            <div key={i} className="rounded-2xl border border-border p-6 hover:border-foreground/30 transition-colors">
              <f.icon className="h-5 w-5" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="container py-24">
        <h2 className="font-serif text-3xl md:text-5xl tracking-tight text-center">Simple pricing.</h2>
        <p className="text-center text-muted-foreground mt-3">Start free. Upgrade when you need more.</p>
        <div className="grid md:grid-cols-3 gap-4 mt-12 max-w-5xl mx-auto">
          {PLANS.map(plan => (
            <div key={plan.id} className={`rounded-2xl border p-7 flex flex-col ${plan.highlight ? "border-foreground bg-secondary/30" : "border-border"}`}>
              {plan.highlight && (
                <span className="self-start text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-foreground text-background mb-3">Popular</span>
              )}
              <div className="font-serif text-2xl">{plan.name}</div>
              <div className="text-xs text-muted-foreground mt-1">{plan.tagline}</div>
              <div className="mt-5 flex items-baseline gap-1">
                <span className="font-serif text-4xl">${plan.price}</span>
                <span className="text-sm text-muted-foreground">/mo</span>
              </div>
              <ul className="mt-5 space-y-2 text-sm text-muted-foreground flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex gap-2 items-start">
                    <Check className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => startPurchase(plan)}
                className={`mt-6 rounded-full ${plan.highlight ? "bg-foreground text-background hover:bg-foreground/85" : ""}`}
                variant={plan.highlight ? "default" : "outline"}
              >
                {plan.price === 0 ? "Start free" : `Get ${plan.name}`}
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* Team */}
      <section id="team" className="container py-24">
        <h2 className="font-serif text-3xl md:text-5xl tracking-tight text-center">Built by two.</h2>
        <div className="grid md:grid-cols-2 gap-4 mt-10 max-w-3xl mx-auto">
          <div className="rounded-2xl border border-border p-6 text-center">
            <div className="text-[10px] tracking-widest text-muted-foreground">FOUNDER</div>
            <div className="font-serif text-2xl mt-1">Ashad Umar</div>
          </div>
          <div className="rounded-2xl border border-border p-6 text-center">
            <div className="text-[10px] tracking-widest text-muted-foreground">CO-FOUNDER</div>
            <div className="font-serif text-2xl mt-1">Mujtaba Javed</div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container py-20 text-center">
        <h2 className="font-serif text-3xl md:text-5xl tracking-tight">Try AxoX today.</h2>
        <p className="mt-3 text-muted-foreground">Free forever. No credit card.</p>
        <div className="mt-7">
          <Button asChild size="lg" className="rounded-full bg-foreground text-background hover:bg-foreground/85 px-7 h-12">
            <Link to={user ? "/chat" : "/auth?mode=signup"}>Get started <ArrowRight className="h-4 w-4 ml-1" /></Link>
          </Button>
        </div>
      </section>

      <footer className="container py-8 text-center text-xs text-muted-foreground border-t border-border">
        © {new Date().getFullYear()} AxoX
      </footer>

      <PurchaseFlow plan={purchase} open={!!purchase} onOpenChange={(v) => !v && setPurchase(null)} />
    </div>
  );
};

export default Index;
