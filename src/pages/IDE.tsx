import { useEffect, useRef, useState, useCallback } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";
import {
  Play, Square, GitBranch, Github, Sparkles, Loader2, X,
  FileCode, Plus, Save, Upload, Download, Folder
} from "lucide-react";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type FileTab = { path: string; content: string; dirty: boolean };

export default function IDE() {
  const { user, session, loading } = useAuth();
  const navigate = useNavigate();
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [tier, setTier] = useState<string>("free");
  const [usage, setUsage] = useState<{ week: number; day: number } | null>(null);
  const [limits, setLimits] = useState<{ weekly: number | null; daily: number | null } | null>(null);
  const [starting, setStarting] = useState(false);
  const [running, setRunning] = useState(false);
  const [tabs, setTabs] = useState<FileTab[]>([
    { path: "main.py", content: "# Welcome to AxoX IDE\nprint('Hello from AxoX!')\n", dirty: false },
  ]);
  const [activeTab, setActiveTab] = useState(0);
  const [ghConnected, setGhConnected] = useState(false);
  const [ghUser, setGhUser] = useState<string | null>(null);
  const [agentLog, setAgentLog] = useState<string[]>([]);

  // Init terminal
  useEffect(() => {
    if (!termRef.current || xtermRef.current) return;
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 13,
      theme: { background: "#0a0a0a", foreground: "#e5e5e5", cursor: "#fb923c" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termRef.current);
    fit.fit();
    term.writeln("\x1b[38;5;208m╔═══════════════════════════════════════╗\x1b[0m");
    term.writeln("\x1b[38;5;208m║      AxoX IDE Environment v1.0        ║\x1b[0m");
    term.writeln("\x1b[38;5;208m╚═══════════════════════════════════════╝\x1b[0m");
    term.writeln("Click \x1b[38;5;208mStart Sandbox\x1b[0m to spin up your environment.");
    term.writeln("");
    xtermRef.current = term;
    fitRef.current = fit;
    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [user, loading, navigate]);

  // Check GitHub status + handle return from OAuth
  useEffect(() => {
    if (!user) return;
    supabase.functions.invoke("github-api", { body: { action: "status" } }).then(({ data }) => {
      if (data?.connected) {
        setGhConnected(true);
        setGhUser(data.username);
      }
    });
    if (new URLSearchParams(window.location.search).get("gh") === "connected") {
      toast.success("GitHub connected!");
      window.history.replaceState({}, "", "/ide");
    }
  }, [user]);

  const log = (line: string) => {
    setAgentLog((prev) => [...prev.slice(-100), line]);
    xtermRef.current?.writeln(line);
  };

  const startSandbox = async () => {
    setStarting(true);
    log("\x1b[38;5;208m→\x1b[0m Spinning up E2B sandbox...");
    try {
      const { data, error } = await supabase.functions.invoke("sandbox-create");
      if (error || data?.error) {
        const msg = data?.error || error?.message || "Failed";
        log(`\x1b[31m✗ ${msg}\x1b[0m`);
        toast.error(msg);
        if (msg.includes("limit")) toast.error("Upgrade your plan for more time.");
        return;
      }
      setSandboxId(data.sandboxId);
      setTier(data.tier);
      setUsage(data.usage);
      setLimits(data.limits);
      log(`\x1b[32m✓ Sandbox ready: ${data.sandboxId}\x1b[0m`);
      log(`Tier: ${data.tier} | Weekly: ${data.limits.weekly ? Math.round(data.limits.weekly / 60) + "m" : "∞"} | Daily: ${data.limits.daily ? Math.round(data.limits.daily / 3600) + "h" : "∞"}`);
    } catch (e: any) {
      log(`\x1b[31m✗ ${e.message}\x1b[0m`);
    } finally {
      setStarting(false);
    }
  };

  const stopSandbox = async () => {
    if (!sandboxId) return;
    log("\x1b[33m→ Stopping sandbox...\x1b[0m");
    await supabase.functions.invoke("sandbox-kill", { body: { sandboxId } });
    setSandboxId(null);
    log("\x1b[32m✓ Stopped\x1b[0m");
  };

  const runActiveFile = async () => {
    if (!sandboxId) { toast.error("Start sandbox first"); return; }
    const tab = tabs[activeTab];
    if (!tab) return;
    setRunning(true);
    log(`\x1b[38;5;208m→ Writing ${tab.path}...\x1b[0m`);
    try {
      // Write file
      const writeRes = await supabase.functions.invoke("sandbox-fs", {
        body: { sandboxId, action: "write", path: `/home/user/${tab.path}`, content: tab.content },
      });
      if (writeRes.error) throw new Error(writeRes.error.message);

      // Determine command
      const ext = tab.path.split(".").pop();
      let cmd = `cat /home/user/${tab.path}`;
      if (ext === "py") cmd = `python3 /home/user/${tab.path}`;
      else if (ext === "js" || ext === "mjs") cmd = `node /home/user/${tab.path}`;
      else if (ext === "ts") cmd = `npx -y tsx /home/user/${tab.path}`;
      else if (ext === "sh") cmd = `bash /home/user/${tab.path}`;

      log(`\x1b[38;5;208m→ ${cmd}\x1b[0m`);

      // Stream exec output
      const resp = await fetch(`${FN_URL}/sandbox-exec`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ sandboxId, command: cmd }),
      });

      if (!resp.ok || !resp.body) throw new Error(`Exec failed (${resp.status})`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          // Try parse E2B JSON line
          try {
            const obj = JSON.parse(line);
            if (obj.stdout) xtermRef.current?.write(obj.stdout.replace(/\n/g, "\r\n"));
            if (obj.stderr) xtermRef.current?.write(`\x1b[31m${obj.stderr.replace(/\n/g, "\r\n")}\x1b[0m`);
          } catch {
            if (line.trim()) xtermRef.current?.writeln(line);
          }
        }
      }
      log("\x1b[32m✓ Done\x1b[0m");
    } catch (e: any) {
      log(`\x1b[31m✗ ${e.message}\x1b[0m`);
    } finally {
      setRunning(false);
    }
  };

  const runRawCommand = async (cmd: string) => {
    if (!sandboxId) { toast.error("Start sandbox first"); return; }
    log(`\x1b[38;5;208m$ ${cmd}\x1b[0m`);
    try {
      const resp = await fetch(`${FN_URL}/sandbox-exec`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ sandboxId, command: cmd }),
      });
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          try {
            const obj = JSON.parse(line);
            if (obj.stdout) xtermRef.current?.write(obj.stdout.replace(/\n/g, "\r\n"));
            if (obj.stderr) xtermRef.current?.write(`\x1b[31m${obj.stderr.replace(/\n/g, "\r\n")}\x1b[0m`);
          } catch {
            if (line.trim()) xtermRef.current?.writeln(line);
          }
        }
      }
    } catch (e: any) {
      log(`\x1b[31m✗ ${e.message}\x1b[0m`);
    }
  };

  // GitHub
  const connectGitHub = () => {
    if (!user) return;
    const clientId = "Ov23liBjHSmqHj4coBKF"; // public client id
    const redirect = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/github-oauth-callback`;
    const state = user.id;
    const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&state=${state}&scope=repo`;
    window.location.href = url;
  };

  const commitActiveFile = async () => {
    if (!ghConnected) { toast.error("Connect GitHub first"); return; }
    const tab = tabs[activeTab];
    if (!tab) return;
    const repo = prompt("Repo (owner/name):");
    if (!repo) return;
    const branch = prompt("Branch:", "main") || "main";
    const path = prompt("Path in repo:", tab.path) || tab.path;
    const message = prompt("Commit message:", "Update via AxoX IDE") || "Update";
    log(`\x1b[38;5;208m→ Committing ${path} to ${repo}@${branch}\x1b[0m`);

    // Try to fetch existing sha
    const { data: read } = await supabase.functions.invoke("github-api", {
      body: { action: "read_file", repo, branch, path },
    });

    const { data, error } = await supabase.functions.invoke("github-api", {
      body: { action: "commit_file", repo, branch, path, content: tab.content, message, sha: read?.sha },
    });
    if (error || data?.error) {
      const msg = data?.error || error?.message;
      log(`\x1b[31m✗ ${msg}\x1b[0m`);
      toast.error(msg);
    } else {
      log(`\x1b[32m✓ Committed ${data.commit?.sha?.slice(0, 7) ?? ""}\x1b[0m`);
      toast.success("Committed!");
    }
  };

  // Build SaaS
  const buildSaaS = async () => {
    if (!sandboxId) { toast.error("Start sandbox first"); return; }
    const idea = prompt("Describe the SaaS app:", "Todo app with auth");
    if (!idea) return;
    log(`\x1b[38;5;208m→ Generating SaaS scaffold: ${idea}\x1b[0m`);
    await runRawCommand(`mkdir -p /home/user/saas && cd /home/user/saas && echo "# ${idea}" > README.md && npm init -y > /dev/null && echo "Project scaffolded at /home/user/saas"`);
  };

  // Monaco mount + AI autocomplete
  const onEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    let timeout: any;
    monaco.languages.registerInlineCompletionsProvider({ pattern: "**" }, {
      provideInlineCompletions: async (model, position) => {
        return new Promise((resolve) => {
          clearTimeout(timeout);
          timeout = setTimeout(async () => {
            const prefix = model.getValueInRange({
              startLineNumber: 1, startColumn: 1,
              endLineNumber: position.lineNumber, endColumn: position.column,
            });
            const suffix = model.getValueInRange({
              startLineNumber: position.lineNumber, startColumn: position.column,
              endLineNumber: model.getLineCount(), endColumn: model.getLineMaxColumn(model.getLineCount()),
            });
            try {
              const { data } = await supabase.functions.invoke("ai-autocomplete", {
                body: { prefix, suffix, language: model.getLanguageId() },
              });
              const text = data?.suggestion || "";
              if (!text) return resolve({ items: [] });
              resolve({ items: [{ insertText: text, range: { startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column } }] });
            } catch {
              resolve({ items: [] });
            }
          }, 400);
        });
      },
      freeInlineCompletions: () => {},
    });
  };

  const updateTab = (i: number, content: string) => {
    setTabs((prev) => prev.map((t, idx) => idx === i ? { ...t, content, dirty: true } : t));
  };

  const newTab = () => {
    const name = prompt("File name:", `file${tabs.length + 1}.py`);
    if (!name) return;
    setTabs([...tabs, { path: name, content: "", dirty: false }]);
    setActiveTab(tabs.length);
  };

  const closeTab = (i: number) => {
    if (tabs.length === 1) return;
    setTabs(tabs.filter((_, idx) => idx !== i));
    if (activeTab >= tabs.length - 1) setActiveTab(Math.max(0, tabs.length - 2));
  };

  const langFromPath = (p: string) => {
    const ext = p.split(".").pop()?.toLowerCase();
    const map: Record<string, string> = {
      js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
      py: "python", sh: "shell", json: "json", html: "html", css: "css",
      md: "markdown", go: "go", rs: "rust", java: "java", c: "c", cpp: "cpp",
    };
    return map[ext || ""] || "plaintext";
  };

  const fmtTime = (s: number) => {
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  };

  if (loading) return <div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Top bar */}
      <div className="h-12 border-b border-border flex items-center px-3 gap-2 shrink-0">
        <Link to="/" className="font-bold text-sm mr-2">AxoX IDE</Link>
        <div className="text-xs text-muted-foreground mr-3">Environment</div>

        {!sandboxId ? (
          <Button size="sm" onClick={startSandbox} disabled={starting} variant="hero">
            {starting ? <Loader2 className="animate-spin" /> : <Play />} Start Sandbox
          </Button>
        ) : (
          <Button size="sm" onClick={stopSandbox} variant="destructive">
            <Square /> Stop
          </Button>
        )}

        <Button size="sm" onClick={runActiveFile} disabled={!sandboxId || running}>
          {running ? <Loader2 className="animate-spin" /> : <Play />} Run
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        {!ghConnected ? (
          <Button size="sm" variant="outline" onClick={connectGitHub}>
            <Github /> Connect GitHub
          </Button>
        ) : (
          <>
            <span className="text-xs text-muted-foreground">@{ghUser}</span>
            <Button size="sm" variant="outline" onClick={commitActiveFile}>
              <GitBranch /> Commit
            </Button>
          </>
        )}

        <div className="w-px h-6 bg-border mx-1" />

        <Button size="sm" variant="outline" onClick={buildSaaS} disabled={!sandboxId}>
          <Sparkles /> Build SaaS
        </Button>

        <div className="ml-auto flex items-center gap-3 text-xs">
          <span className={`px-2 py-1 rounded-full ${tier === "axo_plus" ? "bg-gradient-warm text-white" : tier === "premium" ? "bg-primary/20" : "bg-muted"}`}>
            {tier === "axo_plus" ? "Axo+ ∞" : tier === "premium" ? "Paid" : "Free"}
          </span>
          {usage && limits && (
            <span className="text-muted-foreground">
              {limits.weekly ? `${fmtTime(usage.week)}/${fmtTime(limits.weekly)} week` : ""}
              {limits.daily ? ` · ${fmtTime(usage.day)}/${fmtTime(limits.daily)} day` : ""}
            </span>
          )}
        </div>
      </div>

      {/* Main split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: file tabs as list */}
        <div className="w-56 border-r border-border flex flex-col shrink-0">
          <div className="p-2 flex items-center justify-between border-b border-border">
            <span className="text-xs font-semibold flex items-center gap-1"><Folder size={12} /> FILES</span>
            <Button size="sm" variant="ghost" onClick={newTab}><Plus size={14} /></Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {tabs.map((t, i) => (
              <div key={i}
                onClick={() => setActiveTab(i)}
                className={`px-3 py-2 text-xs flex items-center gap-2 cursor-pointer hover:bg-secondary/40 ${activeTab === i ? "bg-secondary/60" : ""}`}>
                <FileCode size={12} className="shrink-0" />
                <span className="truncate flex-1">{t.path}{t.dirty && " •"}</span>
                {tabs.length > 1 && (
                  <X size={12} className="shrink-0 hover:text-destructive" onClick={(e) => { e.stopPropagation(); closeTab(i); }} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Center: editor + terminal */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0">
            <Editor
              height="100%"
              path={tabs[activeTab]?.path}
              language={langFromPath(tabs[activeTab]?.path || "")}
              value={tabs[activeTab]?.content || ""}
              theme="vs-dark"
              onChange={(v) => updateTab(activeTab, v || "")}
              onMount={onEditorMount}
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                inlineSuggest: { enabled: true },
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>
          <div className="h-64 border-t border-border bg-[#0a0a0a] shrink-0">
            <div className="px-3 py-1 text-xs text-muted-foreground border-b border-border bg-background">TERMINAL</div>
            <div ref={termRef} className="h-[calc(100%-26px)] p-1" />
          </div>
        </div>

        {/* Right: agent log */}
        <div className="w-72 border-l border-border flex flex-col shrink-0">
          <div className="p-2 text-xs font-semibold border-b border-border flex items-center gap-1">
            <Sparkles size={12} /> AI AGENT
          </div>
          <div className="flex-1 overflow-y-auto p-2 text-xs font-mono space-y-1">
            {agentLog.length === 0 && <div className="text-muted-foreground">Agent activity will appear here.</div>}
            {agentLog.map((l, i) => (
              <div key={i} className="text-muted-foreground whitespace-pre-wrap break-all">
                {l.replace(/\x1b\[[0-9;]*m/g, "")}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
