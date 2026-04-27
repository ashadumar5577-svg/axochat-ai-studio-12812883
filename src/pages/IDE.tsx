import { useEffect, useRef, useState, useCallback } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";
import {
  Play,
  Square,
  GitBranch,
  Github,
  Sparkles,
  Loader2,
  X,
  FileCode,
  Plus,
  Folder,
  Terminal as TerminalIcon,
  PanelBottom,
  CheckCircle2,
  AlertCircle,
  Code2,
} from "lucide-react";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const HOME_DIR = "/home/user";

type FileTab = { path: string; content: string; dirty: boolean };
type BottomPanel = "terminal" | "output" | "problems";
type RunStatus = "idle" | "running" | "success" | "error";

const stripAnsi = (value: string) => value.replace(/\x1b\[[0-9;]*m/g, "");
const toTerminalText = (value: string) => value.replace(/\r?\n/g, "\r\n");
const shellQuote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;

export default function IDE() {
  const { user, session, loading } = useAuth();
  const navigate = useNavigate();
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const cwdRef = useRef(HOME_DIR);
  const runningRef = useRef(false);
  const currentLineRef = useRef("");

  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [tier, setTier] = useState<string>("free");
  const [usage, setUsage] = useState<{ week: number; day: number } | null>(null);
  const [limits, setLimits] = useState<{ weekly: number | null; daily: number | null } | null>(null);
  const [starting, setStarting] = useState(false);
  const [running, setRunning] = useState(false);
  const [cwd, setCwd] = useState(HOME_DIR);
  const [bottomPanel, setBottomPanel] = useState<BottomPanel>("terminal");
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [lastCommand, setLastCommand] = useState("");
  const [commandOutput, setCommandOutput] = useState("");
  const [commandErrors, setCommandErrors] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [tabs, setTabs] = useState<FileTab[]>([
    {
      path: "main.py",
      content: "# Welcome to AxoX IDE\nprint('Hello from AxoX!')\n",
      dirty: false,
    },
  ]);
  const [activeTab, setActiveTab] = useState(0);
  const [ghConnected, setGhConnected] = useState(false);
  const [ghUser, setGhUser] = useState<string | null>(null);
  const [agentLog, setAgentLog] = useState<string[]>([]);

  useEffect(() => {
    cwdRef.current = cwd;
  }, [cwd]);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  const prompt = useCallback(() => {
    xtermRef.current?.write(`\x1b[38;5;208muser@axox\x1b[0m:\x1b[38;5;75m${cwdRef.current}\x1b[0m$ `);
  }, []);

  const appendActivity = useCallback((line: string, writeToTerminal = true) => {
    setAgentLog((prev) => [...prev.slice(-120), stripAnsi(line)]);
    if (writeToTerminal) xtermRef.current?.writeln(line);
  }, []);

  const appendResult = useCallback((text: string, stream: "stdout" | "stderr" = "stdout") => {
    if (!text) return;
    if (stream === "stderr") setCommandErrors((prev) => prev + text);
    setCommandOutput((prev) => prev + text);
    xtermRef.current?.write(stream === "stderr" ? `\x1b[31m${toTerminalText(text)}\x1b[0m` : toTerminalText(text));
  }, []);

  const startSandbox = useCallback(async (showPrompt = true): Promise<string | null> => {
    if (sandboxId) return sandboxId;
    if (!session?.access_token) {
      toast.error("Sign in first");
      return null;
    }

    setStarting(true);
    appendActivity("\x1b[38;5;208m→\x1b[0m Starting AxoX Linux sandbox...");
    try {
      const { data, error } = await supabase.functions.invoke("sandbox-create");
      if (error || data?.error) {
        const msg = data?.error || error?.message || "Failed to start sandbox";
        appendActivity(`\x1b[31m✗ ${msg}\x1b[0m`);
        toast.error(msg);
        if (msg.toLowerCase().includes("limit")) toast.error("Upgrade your plan for more time.");
        return null;
      }

      setSandboxId(data.sandboxId);
      setTier(data.tier);
      setUsage(data.usage);
      setLimits(data.limits);
      setCwd(HOME_DIR);
      cwdRef.current = HOME_DIR;
      appendActivity(`\x1b[32m✓ Sandbox ready: ${data.sandboxId}\x1b[0m`);
      appendActivity(
        `Tier: ${data.tier} | Weekly: ${data.limits.weekly ? Math.round(data.limits.weekly / 60) + "m" : "∞"} | Daily: ${data.limits.daily ? Math.round(data.limits.daily / 3600) + "h" : "∞"}`,
      );
      if (showPrompt) prompt();
      return data.sandboxId;
    } catch (e: any) {
      appendActivity(`\x1b[31m✗ ${e.message}\x1b[0m`);
      toast.error(e.message || "Sandbox failed");
      return null;
    } finally {
      setStarting(false);
    }
  }, [appendActivity, prompt, sandboxId, session?.access_token]);

  const stopSandbox = async () => {
    if (!sandboxId) return;
    appendActivity("\x1b[33m→ Stopping sandbox...\x1b[0m");
    await supabase.functions.invoke("sandbox-kill", { body: { sandboxId } });
    setSandboxId(null);
    setRunStatus("idle");
    appendActivity("\x1b[32m✓ Stopped\x1b[0m");
  };

  const streamSandboxCommand = useCallback(async (command: string, options?: { echo?: boolean; forcePanel?: boolean }) => {
    if (runningRef.current) {
      xtermRef.current?.writeln("\x1b[33mAnother command is already running.\x1b[0m");
      return { ok: false, stdout: "", stderr: "Command already running\n" };
    }

    const trimmed = command.trim();
    if (!trimmed) return { ok: true, stdout: "", stderr: "" };

    if (trimmed === "clear" || trimmed === "cls") {
      xtermRef.current?.clear();
      setCommandOutput("");
      setCommandErrors("");
      setRunStatus("idle");
      return { ok: true, stdout: "", stderr: "" };
    }

    const activeSandboxId = sandboxId ?? await startSandbox(false);
    if (!activeSandboxId) return { ok: false, stdout: "", stderr: "Sandbox unavailable\n" };

    const isCdCommand = /^cd(?:\s+(.+))?$/.exec(trimmed);
    const effectiveCommand = isCdCommand
      ? `cd ${shellQuote(cwdRef.current)} && cd ${isCdCommand[1] || shellQuote(HOME_DIR)} && pwd`
      : `cd ${shellQuote(cwdRef.current)} && ${trimmed}`;

    setRunning(true);
    runningRef.current = true;
    setRunStatus("running");
    setLastCommand(trimmed);
    setCommandOutput("");
    setCommandErrors("");
    if (options?.forcePanel) setBottomPanel("terminal");
    if (options?.echo) xtermRef.current?.writeln(`\x1b[38;5;208m$ ${trimmed}\x1b[0m`);
    setAgentLog((prev) => [...prev.slice(-120), `$ ${trimmed}`]);

    let stdout = "";
    let stderr = "";
    let ok = true;

    const handleLine = (line: string) => {
      if (!line.trim()) return;
      try {
        const obj = JSON.parse(line);
        if (obj.stdout) {
          stdout += obj.stdout;
          if (!isCdCommand) appendResult(obj.stdout, "stdout");
        }
        if (obj.stderr) {
          stderr += obj.stderr;
          appendResult(obj.stderr, "stderr");
        }
        if (obj.error) {
          ok = false;
          stderr += `${obj.error}\n`;
          appendResult(`${obj.error}\n`, "stderr");
        }
      } catch {
        stdout += `${line}\n`;
        if (!isCdCommand) appendResult(`${line}\n`, "stdout");
      }
    };

    try {
      const resp = await fetch(`${FN_URL}/sandbox-exec`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ sandboxId: activeSandboxId, command: effectiveCommand }),
      });

      if (!resp.ok || !resp.body) {
        const message = await resp.text().catch(() => "");
        throw new Error(message || `Command failed (${resp.status})`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex !== -1) {
          handleLine(buffer.slice(0, newlineIndex));
          buffer = buffer.slice(newlineIndex + 1);
          newlineIndex = buffer.indexOf("\n");
        }
      }
      if (buffer.trim()) handleLine(buffer);

      if (isCdCommand) {
        if (stderr.trim()) {
          ok = false;
        } else {
          const nextCwd = stdout.trim().split("\n").pop() || cwdRef.current;
          cwdRef.current = nextCwd;
          setCwd(nextCwd);
        }
      }

      setRunStatus(ok ? "success" : "error");
      setAgentLog((prev) => [...prev.slice(-120), ok ? "✓ Command finished" : "✗ Command failed"]);
      return { ok, stdout, stderr };
    } catch (e: any) {
      ok = false;
      const message = `${e.message || "Command failed"}\n`;
      stderr += message;
      appendResult(message, "stderr");
      setRunStatus("error");
      toast.error(e.message || "Command failed");
      return { ok, stdout, stderr };
    } finally {
      setRunning(false);
      runningRef.current = false;
      if ((stdout || stderr) && !(stdout + stderr).endsWith("\n")) xtermRef.current?.write("\r\n");
    }
  }, [appendResult, sandboxId, session?.access_token, startSandbox]);

  useEffect(() => {
    if (!termRef.current || xtermRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 3000,
      theme: {
        background: "#0c0a09",
        foreground: "#f5f5f4",
        cursor: "#fb923c",
        selectionBackground: "#7c2d12",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(termRef.current);
    fit.fit();
    term.writeln("\x1b[38;5;208m╔════════════════════════════════════════╗\x1b[0m");
    term.writeln("\x1b[38;5;208m║        AxoX IDE Environment           ║\x1b[0m");
    term.writeln("\x1b[38;5;208m╚════════════════════════════════════════╝\x1b[0m");
    term.writeln("Type a command and press Enter. The sandbox starts automatically.");
    term.writeln("");
    xtermRef.current = term;
    fitRef.current = fit;
    prompt();

    term.onData((data) => {
      for (const ch of data) {
        const code = ch.charCodeAt(0);
        if (code === 3) {
          currentLineRef.current = "";
          term.write("^C\r\n");
          prompt();
        } else if (code === 13) {
          term.write("\r\n");
          const cmd = currentLineRef.current.trim();
          currentLineRef.current = "";
          if (!cmd) {
            prompt();
          } else {
            (window as any).__axoxRunCmd?.(cmd).finally(() => prompt());
          }
        } else if (code === 127) {
          if (currentLineRef.current.length > 0) {
            currentLineRef.current = currentLineRef.current.slice(0, -1);
            term.write("\b \b");
          }
        } else if (code >= 32) {
          currentLineRef.current += ch;
          term.write(ch);
        }
      }
    });

    const onResize = () => fit.fit();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      term.dispose();
      xtermRef.current = null;
    };
  }, [prompt]);

  useEffect(() => {
    fitRef.current?.fit();
  }, [bottomPanel]);

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [user, loading, navigate]);

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

  const runRawCommand = useCallback(async (cmd: string) => {
    await streamSandboxCommand(cmd, { forcePanel: true });
  }, [streamSandboxCommand]);

  useEffect(() => {
    (window as any).__axoxRunCmd = runRawCommand;
    return () => { delete (window as any).__axoxRunCmd; };
  }, [runRawCommand]);

  const runActiveFile = async () => {
    const tab = tabs[activeTab];
    if (!tab) return;

    const activeSandboxId = sandboxId ?? await startSandbox(false);
    if (!activeSandboxId) return;

    setBottomPanel("terminal");
    setPreviewHtml("");
    appendActivity(`\x1b[38;5;208m→ Writing ${tab.path}...\x1b[0m`);
    try {
      const writeRes = await supabase.functions.invoke("sandbox-fs", {
        body: { sandboxId: activeSandboxId, action: "write", path: `${HOME_DIR}/${tab.path}`, content: tab.content },
      });
      if (writeRes.error || writeRes.data?.error) throw new Error(writeRes.data?.error || writeRes.error?.message);

      const ext = tab.path.split(".").pop()?.toLowerCase();
      let cmd = `cat ${shellQuote(`${HOME_DIR}/${tab.path}`)}`;
      if (ext === "py") cmd = `python3 ${shellQuote(`${HOME_DIR}/${tab.path}`)}`;
      else if (ext === "js" || ext === "mjs") cmd = `node ${shellQuote(`${HOME_DIR}/${tab.path}`)}`;
      else if (ext === "ts") cmd = `npx -y tsx ${shellQuote(`${HOME_DIR}/${tab.path}`)}`;
      else if (ext === "sh") cmd = `bash ${shellQuote(`${HOME_DIR}/${tab.path}`)}`;
      else if (ext === "html") setPreviewHtml(tab.content);

      await streamSandboxCommand(cmd, { echo: true, forcePanel: true });
    } catch (e: any) {
      appendResult(`${e.message || "Run failed"}\n`, "stderr");
      setRunStatus("error");
      toast.error(e.message || "Run failed");
    }
  };

  const connectGitHub = () => {
    if (!user) return;
    const clientId = "Ov23liBjHSmqHj4coBKF";
    const redirect = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/github-oauth-callback`;
    const state = user.id;
    const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&state=${state}&scope=repo`;
    window.location.href = url;
  };

  const commitActiveFile = async () => {
    if (!ghConnected) { toast.error("Connect GitHub first"); return; }
    const tab = tabs[activeTab];
    if (!tab) return;
    const repo = promptWindow("Repo (owner/name):");
    if (!repo) return;
    const branch = promptWindow("Branch:", "main") || "main";
    const path = promptWindow("Path in repo:", tab.path) || tab.path;
    const message = promptWindow("Commit message:", "Update via AxoX IDE") || "Update";
    appendActivity(`\x1b[38;5;208m→ Committing ${path} to ${repo}@${branch}\x1b[0m`);

    const { data: read } = await supabase.functions.invoke("github-api", {
      body: { action: "read_file", repo, branch, path },
    });

    const { data, error } = await supabase.functions.invoke("github-api", {
      body: { action: "commit_file", repo, branch, path, content: tab.content, message, sha: read?.sha },
    });
    if (error || data?.error) {
      const msg = data?.error || error?.message;
      appendActivity(`\x1b[31m✗ ${msg}\x1b[0m`);
      toast.error(msg);
    } else {
      appendActivity(`\x1b[32m✓ Committed ${data.commit?.sha?.slice(0, 7) ?? ""}\x1b[0m`);
      toast.success("Committed!");
    }
  };

  const buildSaaS = async () => {
    const idea = promptWindow("Describe the SaaS app:", "Todo app with auth");
    if (!idea) return;
    appendActivity(`\x1b[38;5;208m→ Generating SaaS scaffold: ${idea}\x1b[0m`);
    await streamSandboxCommand(`mkdir -p saas && cd saas && printf ${shellQuote(`# ${idea}\n`)} > README.md && npm init -y >/dev/null && echo "Project scaffolded at $(pwd)"`, { echo: true, forcePanel: true });
  };

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
              startLineNumber: 1,
              startColumn: 1,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            });
            const suffix = model.getValueInRange({
              startLineNumber: position.lineNumber,
              startColumn: position.column,
              endLineNumber: model.getLineCount(),
              endColumn: model.getLineMaxColumn(model.getLineCount()),
            });
            try {
              const { data } = await supabase.functions.invoke("ai-autocomplete", {
                body: { prefix, suffix, language: model.getLanguageId() },
              });
              const text = data?.suggestion || "";
              if (!text) return resolve({ items: [] });
              resolve({
                items: [{
                  insertText: text,
                  range: {
                    startLineNumber: position.lineNumber,
                    startColumn: position.column,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column,
                  },
                }],
              });
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
    const name = promptWindow("File name:", `file${tabs.length + 1}.py`);
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
      js: "javascript",
      jsx: "javascript",
      ts: "typescript",
      tsx: "typescript",
      py: "python",
      sh: "shell",
      json: "json",
      html: "html",
      css: "css",
      md: "markdown",
      go: "go",
      rs: "rust",
      java: "java",
      c: "c",
      cpp: "cpp",
    };
    return map[ext || ""] || "plaintext";
  };

  const fmtTime = (s: number) => {
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-background text-foreground"><Loader2 className="animate-spin" /></div>;
  }

  const statusIcon = runStatus === "running"
    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
    : runStatus === "error"
      ? <AlertCircle className="h-3.5 w-3.5 text-destructive" />
      : <CheckCircle2 className="h-3.5 w-3.5 text-primary" />;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-card px-3 text-xs">
        <Link to="/" className="mr-2 flex items-center gap-2 font-bold">
          <Code2 className="h-4 w-4 text-primary" /> AxoX IDE Environment
        </Link>
        <span className="text-muted-foreground">File</span>
        <span className="text-muted-foreground">Run</span>
        <span className="text-muted-foreground">Terminal</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="rounded-sm bg-secondary px-2 py-0.5 text-muted-foreground">{sandboxId ? "Sandbox online" : "Sandbox standby"}</span>
          <span className="rounded-sm bg-secondary px-2 py-0.5 text-muted-foreground">{cwd}</span>
        </div>
      </div>

      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
        {!sandboxId ? (
          <Button size="sm" onClick={() => startSandbox()} disabled={starting} variant="hero">
            {starting ? <Loader2 className="animate-spin" /> : <Play />} Start Sandbox
          </Button>
        ) : (
          <Button size="sm" onClick={stopSandbox} variant="destructive">
            <Square /> Stop
          </Button>
        )}

        <Button size="sm" onClick={runActiveFile} disabled={running || starting}>
          {running ? <Loader2 className="animate-spin" /> : <Play />} Run File
        </Button>

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

        <Button size="sm" variant="outline" onClick={buildSaaS} disabled={running || starting}>
          <Sparkles /> Build SaaS
        </Button>

        <div className="ml-auto flex items-center gap-3 text-xs">
          <span className="rounded-full bg-secondary px-2 py-1 text-muted-foreground">
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

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex w-12 shrink-0 flex-col items-center border-r border-border bg-card py-2">
          <button className="mb-2 rounded-sm bg-secondary p-2 text-primary" aria-label="Explorer"><Folder className="h-5 w-5" /></button>
          <button className="mb-2 rounded-sm p-2 text-muted-foreground hover:bg-secondary" aria-label="Terminal" onClick={() => setBottomPanel("terminal")}><TerminalIcon className="h-5 w-5" /></button>
          <button className="rounded-sm p-2 text-muted-foreground hover:bg-secondary" aria-label="Output" onClick={() => setBottomPanel("output")}><PanelBottom className="h-5 w-5" /></button>
        </div>

        <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-background">
          <div className="flex h-9 items-center justify-between border-b border-border px-3">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Folder className="h-3.5 w-3.5" /> Explorer</span>
            <Button size="sm" variant="ghost" onClick={newTab} aria-label="New file"><Plus className="h-4 w-4" /></Button>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {tabs.map((t, i) => (
              <button
                key={`${t.path}-${i}`}
                onClick={() => setActiveTab(i)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-secondary ${activeTab === i ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
              >
                <FileCode className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{t.path}{t.dirty && " •"}</span>
                {tabs.length > 1 && (
                  <X className="h-3.5 w-3.5 shrink-0 hover:text-destructive" onClick={(e) => { e.stopPropagation(); closeTab(i); }} />
                )}
              </button>
            ))}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex h-9 shrink-0 items-center border-b border-border bg-card">
            {tabs.map((t, i) => (
              <button
                key={`tab-${t.path}-${i}`}
                onClick={() => setActiveTab(i)}
                className={`flex h-full max-w-52 items-center gap-2 border-r border-border px-3 text-xs ${activeTab === i ? "bg-background text-foreground" : "text-muted-foreground hover:bg-secondary"}`}
              >
                <FileCode className="h-3.5 w-3.5" />
                <span className="truncate">{t.path}{t.dirty && " •"}</span>
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1">
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
                fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace",
                minimap: { enabled: true },
                inlineSuggest: { enabled: true },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 12 },
              }}
            />
          </div>

          <section className="h-72 shrink-0 border-t border-border bg-card">
            <div className="flex h-9 items-center border-b border-border text-xs">
              <button onClick={() => setBottomPanel("terminal")} className={`flex h-full items-center gap-2 px-3 ${bottomPanel === "terminal" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}><TerminalIcon className="h-3.5 w-3.5" /> Terminal</button>
              <button onClick={() => setBottomPanel("output")} className={`flex h-full items-center gap-2 px-3 ${bottomPanel === "output" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}><PanelBottom className="h-3.5 w-3.5" /> Output</button>
              <button onClick={() => setBottomPanel("problems")} className={`flex h-full items-center gap-2 px-3 ${bottomPanel === "problems" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}><AlertCircle className="h-3.5 w-3.5" /> Problems</button>
              <div className="ml-auto flex items-center gap-2 px-3 text-muted-foreground">{statusIcon}<span>{runStatus}</span></div>
            </div>
            <div className="h-[calc(100%-36px)] overflow-hidden">
              <div className={`${bottomPanel === "terminal" ? "block" : "hidden"} h-full bg-background p-1`} ref={termRef} />
              {bottomPanel === "output" && (
                <pre className="h-full overflow-auto whitespace-pre-wrap p-3 font-mono text-xs text-foreground">{commandOutput || "Run a file or type a command in the terminal to see output here."}</pre>
              )}
              {bottomPanel === "problems" && (
                <pre className="h-full overflow-auto whitespace-pre-wrap p-3 font-mono text-xs text-muted-foreground">{commandErrors || "No problems detected."}</pre>
              )}
            </div>
          </section>
        </main>

        <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-background">
          <div className="flex h-9 items-center gap-2 border-b border-border px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Run Result
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 text-xs">
            <div className="rounded-sm border border-border bg-card p-3">
              <div className="mb-2 flex items-center gap-2 font-semibold">{statusIcon}<span>{runStatus === "idle" ? "Ready" : runStatus}</span></div>
              <div className="break-all font-mono text-muted-foreground">{lastCommand || "No command run yet"}</div>
            </div>

            {previewHtml && (
              <div className="min-h-64 overflow-hidden rounded-sm border border-border bg-card">
                <div className="border-b border-border px-3 py-2 font-semibold text-muted-foreground">HTML Preview</div>
                <iframe title="HTML preview" srcDoc={previewHtml} className="h-56 w-full bg-background" sandbox="allow-scripts" />
              </div>
            )}

            <div className="min-h-40 rounded-sm border border-border bg-card">
              <div className="border-b border-border px-3 py-2 font-semibold text-muted-foreground">Latest Output</div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs text-foreground">{commandOutput || "Output and command results appear here."}</pre>
            </div>

            <div className="rounded-sm border border-border bg-card">
              <div className="border-b border-border px-3 py-2 font-semibold text-muted-foreground">Activity</div>
              <div className="max-h-48 overflow-auto p-3 font-mono text-xs text-muted-foreground">
                {agentLog.length === 0 ? "No activity yet." : agentLog.slice(-20).map((line, i) => <div key={`${line}-${i}`} className="break-words">{line}</div>)}
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div className="flex h-6 shrink-0 items-center gap-4 border-t border-border bg-primary px-3 text-xs text-primary-foreground">
        <span>{sandboxId ? "AxoX sandbox connected" : "AxoX sandbox will auto-start on first command"}</span>
        <span>{cwd}</span>
        <span className="ml-auto">VS Code-style cloud workspace</span>
      </div>
    </div>
  );
}

function promptWindow(message: string, defaultValue?: string) {
  return window.prompt(message, defaultValue);
}
