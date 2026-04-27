import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { ChevronDown, Brain } from "lucide-react";

type Props = { content: string };

// Splits a message into ordered segments: "think" blocks (from <think>...</think>) and "text".
// Handles streaming where </think> may not have arrived yet.
function splitThink(raw: string): Array<{ type: "think" | "text"; content: string; closed: boolean }> {
  const out: Array<{ type: "think" | "text"; content: string; closed: boolean }> = [];
  let i = 0;
  while (i < raw.length) {
    const open = raw.indexOf("<think>", i);
    if (open === -1) {
      const tail = raw.slice(i);
      if (tail) out.push({ type: "text", content: tail, closed: true });
      break;
    }
    if (open > i) out.push({ type: "text", content: raw.slice(i, open), closed: true });
    const close = raw.indexOf("</think>", open + 7);
    if (close === -1) {
      out.push({ type: "think", content: raw.slice(open + 7), closed: false });
      break;
    }
    out.push({ type: "think", content: raw.slice(open + 7, close), closed: true });
    i = close + 8;
  }
  return out;
}

function MD({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
    >
      {children}
    </ReactMarkdown>
  );
}

function ThinkBlock({ content, streaming }: { content: string; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-3 rounded-lg border border-border bg-secondary/30 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-secondary/50 transition-colors"
      >
        <Brain className="h-3 w-3" />
        <span className="flex-1 text-left">
          {streaming ? "Thinking…" : "Thought process"}
        </span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border max-h-80 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
          {content.trim() || "…"}
        </div>
      )}
    </div>
  );
}

export function MessageContent({ content }: Props) {
  const segments = splitThink(content);
  const nodes: ReactNode[] = [];
  segments.forEach((seg, i) => {
    if (seg.type === "think") {
      nodes.push(<ThinkBlock key={i} content={seg.content} streaming={!seg.closed} />);
    } else if (seg.content.trim()) {
      nodes.push(<MD key={i}>{seg.content}</MD>);
    }
  });
  return <>{nodes}</>;
}
