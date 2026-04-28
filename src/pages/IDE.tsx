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
  Bot,
  Send,
  Cpu,
  HardDrive,
  MemoryStick,
  Save,
  RefreshCcw,
  FolderPlus,
  FolderOpen,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const HOME_DIR = "/home/user";

type FileTab = { path: string; content: string; dirty: boolean };
type BottomPanel = "terminal" | "output" | "problems";
type RunStatus = "idle" | "running" | "success" | "error";
type RightPanel = "result" | "chat";
type ChatMsg = { role: "user" | "assistant"; content: string; events?: { name: string; args: any; result: any }[] };
type FsNode = { path: string; name: string; type: "file" | "dir"; depth: number; saved?: boolean };

const OS_OPTIONS = [
  { id: "ubuntu-22.04", label: "Ubuntu 22.04 LTS", desc: "Default — broad compatibility" },
  { id: "ubuntu-24.04", label: "Ubuntu 24.04 LTS", desc: "Latest Ubuntu" },
  { id: "debian-12", label: "Debian 12", desc: "Stable Linux" },
  { id: "node", label: "Node.js workspace", desc: "Pre-installed Node + npm" },
  { id: "python", label: "Python workspace", desc: "Pre-installed Python 3" },
];

const stripAnsi = (value: string) => value.replace(/\x1b\[[0-9;]*m/g, "");
const toTerminalText = (value: string) => value.replace(/\r?\n/g, "\r\n");
const shellQuote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
const normalizeWorkspacePath = (path: string) => path.replace(/^\/home\/user\/?/, "").replace(/^\/+/, "").replace(/\/+/g, "/") || "main.py";

const treeFromPaths = (paths: string[]): FsNode[] => {
  const nodes = new Map<string, FsNode>();
  for (const raw of paths) {
    const path = normalizeWorkspacePath(raw);
    const parts = path.split("/").filter(Boolean);
    parts.forEach((part, idx) => {
      const itemPath = parts.slice(0, idx + 1).join("/");
      const type = idx === parts.length - 1 ? "file" : "dir";
      if (!nodes.has(itemPath)) nodes.set(itemPath, { path: itemPath, name: part, type, depth: idx, saved: true });
    });
  }
  return [...nodes.values()].sort((a, b) => a.path.localeCompare(b.path));
};

export default function IDE() {
  const { user, session, loading } = useAuth();
  const navigate = useNavigate();
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const cwdRef = useRef(HOME_DIR);
  const sandboxIdRef = useRef<string | null>(null);
  const runningRef = useRef(false);
  const currentLineRef = useRef("");
  const rootModeRef = useRef(false);

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
  const [resources, setResources] = useState<{ ramGb: number; vcpu: number; diskGb: number } | null>(null);
  const [osTemplate, setOsTemplate] = useState<string>("ubuntu-22.04");
  const [osPickerOpen, setOsPickerOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState<RightPanel>("chat");
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [fileTree, setFileTree] = useState<FsNode[]>(treeFromPaths(["main.py"]));
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [rootMode, setRootMode] = useState(false);

  useEffect(() => {
    cwdRef.current = cwd;
  }, [cwd]);

  useEffect(() => {
    sandboxIdRef.current = sandboxId;
  }, [sandboxId]);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  const prompt = useCallback(() => {
    const name = rootModeRef.current ? "root" : "user";
    const symbol = rootModeRef.current ? "#" : "$";
    xtermRef.current?.write(`\x1b[38;5;208m${name}@axox\x1b[0m:\x1b[38;5;75m${cwdRef.current}\x1b[0m${symbol} `);
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

  const refreshWorkspaceTree = useCallback(async (activeSandboxId = sandboxIdRef.current) => {
    const saved = tabs.map((t) => normalizeWorkspacePath(t.path));
    if (!activeSandboxId) {
      setFileTree(treeFromPaths(saved));
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("sandbox-fs", {
        body: { sandboxId: activeSandboxId, action: "tree", path: HOME_DIR },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      const remote = (data.entries || []).map((e: any) => normalizeWorkspacePath(e.path)).filter(Boolean);
      setFileTree(treeFromPaths([...saved, ...remote]));
    } catch {
      setFileTree(treeFromPaths(saved));
    }
  }, [tabs]);

  const saveTabToCloud = useCallback(async (tab: FileTab) => {
    if (!user) return;
    const path = normalizeWorkspacePath(tab.path);
    const { error } = await supabase.from("ide_files" as any).upsert({
      user_id: user.id,
      path,
      content: tab.content,
    } as any, { onConflict: "user_id,path" });
    if (error) throw error;
  }, [user]);

  const saveAllWorkspace = useCallback(async (options?: { silent?: boolean }) => {
    if (!user || saving) return;
    setSaving(true);
    try {
      await Promise.all(tabs.map(saveTabToCloud));
      setTabs((prev) => prev.map((t) => ({ ...t, dirty: false })));
      await refreshWorkspaceTree();
      if (!options?.silent) toast.success("Workspace saved");
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }, [refreshWorkspaceTree, saveTabToCloud, saving, tabs, user]);

  const startSandbox = useCallback(async (showPrompt = true, templateOverride?: string): Promise<string | null> => {
    if (sandboxIdRef.current) return sandboxIdRef.current;
    if (!session?.access_token) {
      toast.error("Sign in first");
      return null;
    }

    const template = templateOverride || osTemplate;
    setStarting(true);
    appendActivity(`\x1b[38;5;208m→\x1b[0m Booting ${template} sandbox...`);
    try {
      const { data, error } = await supabase.functions.invoke("sandbox-create", { body: { template } });
      if (error || data?.error) {
        const msg = data?.error || error?.message || "Failed to start sandbox";
        appendActivity(`\x1b[31m✗ ${msg}\x1b[0m`);
        toast.error(msg);
        if (msg.toLowerCase().includes("limit")) toast.error("Upgrade your plan for more time.");
        return null;
      }

      sandboxIdRef.current = data.sandboxId;
      setSandboxId(data.sandboxId);
      setTier(data.tier);
      setUsage(data.usage);
      setLimits(data.limits);
      setResources(data.resources || null);
      setCwd(HOME_DIR);
      cwdRef.current = HOME_DIR;
      appendActivity(`\x1b[32m✓ ${template} ready: ${data.sandboxId}\x1b[0m`);
      if (data.os) appendActivity(`OS: ${data.os.name} ${data.os.version}`);
      if (data.resources) appendActivity(`Resources: ${data.resources.ramGb}GB RAM · ${data.resources.vcpu} vCPU · ${data.resources.diskGb}GB disk`);
      appendActivity(
        `Tier: ${data.tier} | Daily: ${data.limits.daily ? Math.round(data.limits.daily / 3600) + "h" : "∞"}`,
      );
      for (const tab of tabs) {
        await supabase.functions.invoke("sandbox-fs", {
          body: { sandboxId: data.sandboxId, action: "write", path: `${HOME_DIR}/${normalizeWorkspacePath(tab.path)}`, content: tab.content },
        });
      }
      await refreshWorkspaceTree(data.sandboxId);
      if (showPrompt) prompt();
      return data.sandboxId;
    } catch (e: any) {
      appendActivity(`\x1b[31m✗ ${e.message}\x1b[0m`);
      toast.error(e.message || "Sandbox failed");
      return null;
    } finally {
      setStarting(false);
    }
  }, [appendActivity, prompt, sandboxId, session?.access_token, osTemplate, tabs, refreshWorkspaceTree]);

  const sendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    setChatInput("");
    const next: ChatMsg[] = [...chat, { role: "user", content: text }];
    setChat(next);
    setChatBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-agent", {
        body: {
          sandboxId: sandboxIdRef.current,
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        },
      });
      if (error || data?.error) {
        const msg = data?.error || error?.message || "AI failed";
        toast.error(msg);
        setChat((prev) => [...prev, { role: "assistant", content: `⚠️ ${msg}` }]);
      } else {
        setChat((prev) => [...prev, { role: "assistant", content: data.reply || "(no reply)", events: data.toolEvents || [] }]);
        if (data.toolEvents?.length) {
          for (const ev of data.toolEvents) {
            appendActivity(`\x1b[36m🤖 ${ev.name}(${JSON.stringify(ev.args).slice(0, 80)})\x1b[0m`, false);
          }
        }
      }
    } catch (e: any) {
      toast.error(e.message || "AI failed");
    } finally {
      setChatBusy(false);
    }
  }, [chat, chatInput, chatBusy, appendActivity]);

  const stopSandbox = async () => {
    if (!sandboxId) return;
    appendActivity("\x1b[33m→ Stopping sandbox...\x1b[0m");
    await supabase.functions.invoke("sandbox-kill", { body: { sandboxId } });
    sandboxIdRef.current = null;
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

    if (["sudo su", "sudo -i", "su", "su -", "sudo bash", "sudo sh"].includes(trimmed)) {
      rootModeRef.current = true;
      setRootMode(true);
      xtermRef.current?.writeln("\x1b[32mSwitched to root command mode. Type exit to return to user.\x1b[0m");
      return { ok: true, stdout: "", stderr: "" };
    }

    if (trimmed === "exit" && rootModeRef.current) {
      rootModeRef.current = false;
      setRootMode(false);
      xtermRef.current?.writeln("\x1b[32mReturned to user mode.\x1b[0m");
      return { ok: true, stdout: "", stderr: "" };
    }

    if (trimmed === "clear" || trimmed === "cls") {
      xtermRef.current?.clear();
      setCommandOutput("");
      setCommandErrors("");
      setRunStatus("idle");
      return { ok: true, stdout: "", stderr: "" };
    }

    const activeSandboxId = sandboxIdRef.current ?? await startSandbox(false);
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
        body: JSON.stringify({ sandboxId: activeSandboxId, command: effectiveCommand, asRoot: rootModeRef.current }),
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

      await refreshWorkspaceTree(activeSandboxId);

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
  }, [appendResult, refreshWorkspaceTree, sandboxId, session?.access_token, startSandbox]);

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
    let cancelled = false;

    const restoreWorkspace = async () => {
      setRestoring(true);
      try {
        const cutoff = new Date(Date.now() - 62 * 24 * 60 * 60 * 1000).toISOString();
        await supabase.from("ide_files" as any).delete().eq("user_id", user.id).lt("updated_at", cutoff);

        const { data, error } = await supabase
          .from("ide_files" as any)
          .select("path, content")
          .eq("user_id", user.id)
          .order("path", { ascending: true });
        if (error) throw error;
        if (cancelled || !data?.length) {
          if (!data?.length) setFileTree(treeFromPaths(tabs.map((t) => t.path)));
          return;
        }
        const restored = data.map((row: any) => ({ path: normalizeWorkspacePath(row.path), content: row.content || "", dirty: false }));
        setTabs(restored);
        setActiveTab(0);
        setFileTree(treeFromPaths(restored.map((t) => t.path)));
      } catch (e: any) {
        toast.error(e.message || "Could not restore workspace");
      } finally {
        if (!cancelled) setRestoring(false);
      }
    };

    restoreWorkspace();
    return () => { cancelled = true; };
  }, [user]);

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

    const activeSandboxId = sandboxIdRef.current ?? await startSandbox(false);
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
          <Button size="sm" onClick={() => setOsPickerOpen(true)} disabled={starting} variant="hero">
            {starting ? <Loader2 className="animate-spin" /> : <Play />} New Environment
          </Button>
        ) : (
          <Button size="sm" onClick={stopSandbox} variant="destructive">
            <Square /> Stop
          </Button>
        )}
        <span className="rounded-sm border border-border bg-secondary px-2 py-1 text-[11px] text-muted-foreground">{osTemplate}</span>

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
          <button className="mb-2 rounded-sm p-2 text-muted-foreground hover:bg-secondary" aria-label="Output" onClick={() => setBottomPanel("output")}><PanelBottom className="h-5 w-5" /></button>
          <button className={`rounded-sm p-2 ${rightPanel === "chat" ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-secondary"}`} aria-label="AI Chat" onClick={() => setRightPanel("chat")}><Bot className="h-5 w-5" /></button>
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

        <aside className="flex w-96 shrink-0 flex-col border-l border-border bg-background">
          <div className="flex h-9 shrink-0 items-center border-b border-border text-xs">
            <button onClick={() => setRightPanel("chat")} className={`flex h-full items-center gap-2 px-3 ${rightPanel === "chat" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <Bot className="h-3.5 w-3.5" /> AxoX Copilot
            </button>
            <button onClick={() => setRightPanel("result")} className={`flex h-full items-center gap-2 px-3 ${rightPanel === "result" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <Sparkles className="h-3.5 w-3.5" /> Run Result
            </button>
          </div>

          {rightPanel === "result" && (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 text-xs">
              <div className="rounded-sm border border-border bg-card p-3">
                <div className="mb-2 flex items-center gap-2 font-semibold">{statusIcon}<span>{runStatus === "idle" ? "Ready" : runStatus}</span></div>
                <div className="break-all font-mono text-muted-foreground">{lastCommand || "No command run yet"}</div>
              </div>
              {resources && (
                <div className="grid grid-cols-3 gap-2 rounded-sm border border-border bg-card p-3 text-center">
                  <div><MemoryStick className="mx-auto h-4 w-4 text-primary" /><div className="mt-1 font-semibold">{resources.ramGb}GB</div><div className="text-muted-foreground">RAM</div></div>
                  <div><Cpu className="mx-auto h-4 w-4 text-primary" /><div className="mt-1 font-semibold">{resources.vcpu}</div><div className="text-muted-foreground">vCPU</div></div>
                  <div><HardDrive className="mx-auto h-4 w-4 text-primary" /><div className="mt-1 font-semibold">{resources.diskGb}GB</div><div className="text-muted-foreground">Disk</div></div>
                </div>
              )}
              {previewHtml && (
                <div className="min-h-64 overflow-hidden rounded-sm border border-border bg-card">
                  <div className="border-b border-border px-3 py-2 font-semibold text-muted-foreground">HTML Preview</div>
                  <iframe title="HTML preview" srcDoc={previewHtml} className="h-56 w-full bg-background" sandbox="allow-scripts" />
                </div>
              )}
              <div className="min-h-40 rounded-sm border border-border bg-card">
                <div className="border-b border-border px-3 py-2 font-semibold text-muted-foreground">Latest Output</div>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs text-foreground">{commandOutput || "Output appears here."}</pre>
              </div>
              <div className="rounded-sm border border-border bg-card">
                <div className="border-b border-border px-3 py-2 font-semibold text-muted-foreground">Activity</div>
                <div className="max-h-48 overflow-auto p-3 font-mono text-xs text-muted-foreground">
                  {agentLog.length === 0 ? "No activity yet." : agentLog.slice(-20).map((line, i) => <div key={`${line}-${i}`} className="break-words">{line}</div>)}
                </div>
              </div>
            </div>
          )}

          {rightPanel === "chat" && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-3 overflow-y-auto p-3 text-xs">
                {chat.length === 0 && (
                  <div className="rounded-md border border-border bg-card p-3 text-muted-foreground">
                    <div className="mb-1 flex items-center gap-2 font-semibold text-foreground"><Bot className="h-4 w-4 text-primary" /> AxoX Copilot</div>
                    Ask me to write code, create files, run commands, or fix bugs in your sandbox.
                  </div>
                )}
                {chat.map((m, i) => (
                  <div key={i} className={`rounded-md border p-3 ${m.role === "user" ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{m.role === "user" ? "You" : "Copilot"}</div>
                    <div className="whitespace-pre-wrap text-foreground">{m.content}</div>
                    {m.events && m.events.length > 0 && (
                      <div className="mt-2 space-y-1 border-t border-border pt-2">
                        {m.events.map((ev, j) => (
                          <div key={j} className="font-mono text-[10px] text-muted-foreground">
                            <span className="text-primary">⚡ {ev.name}</span>
                            {ev.args?.path && <> · {ev.args.path}</>}
                            {ev.args?.command && <> · {String(ev.args.command).slice(0, 60)}</>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {chatBusy && (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-card p-3 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking...
                  </div>
                )}
              </div>
              <div className="border-t border-border p-2">
                <div className="flex items-end gap-2">
                  <Textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                    placeholder="Ask Copilot... (Enter to send)"
                    className="min-h-[44px] resize-none text-xs"
                    rows={2}
                  />
                  <Button size="sm" onClick={sendChat} disabled={chatBusy || !chatInput.trim()}>
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {sandboxId ? "Connected to sandbox — Copilot can edit files & run commands" : "No sandbox — Copilot will only chat. Start an environment to enable tools."}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      <div className="flex h-6 shrink-0 items-center gap-4 border-t border-border bg-primary px-3 text-xs text-primary-foreground">
        <span>{sandboxId ? "AxoX sandbox connected" : "AxoX sandbox will auto-start on first command"}</span>
        <span>{cwd}</span>
        <span className="ml-auto">VS Code-style cloud workspace</span>

      {osPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => setOsPickerOpen(false)}>
          <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-foreground">Create AxoX Environment</h2>
              <p className="text-xs text-muted-foreground">Choose an operating system / runtime template.</p>
            </div>
            <div className="space-y-2">
              {OS_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setOsTemplate(opt.id)}
                  className={`flex w-full items-start justify-between rounded-md border p-3 text-left text-sm transition ${osTemplate === opt.id ? "border-primary bg-primary/5" : "border-border hover:bg-secondary"}`}
                >
                  <div>
                    <div className="font-semibold text-foreground">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.desc}</div>
                  </div>
                  {osTemplate === opt.id && <CheckCircle2 className="h-4 w-4 text-primary" />}
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-md border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
              <div className="mb-1 font-semibold text-foreground">Resources for your tier</div>
              <div>Free: 4GB RAM · 3 vCPU · 30GB disk · 1h/day</div>
              <div>Paid: 12GB RAM · 5 vCPU · 200GB disk · 12h/day</div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOsPickerOpen(false)}>Cancel</Button>
              <Button variant="hero" onClick={() => { setOsPickerOpen(false); startSandbox(true, osTemplate); }} disabled={starting}>
                {starting ? <Loader2 className="animate-spin" /> : <Play />} Launch
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

function promptWindow(message: string, defaultValue?: string) {
  return window.prompt(message, defaultValue);
}
