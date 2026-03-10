import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { ImageIcon } from "lucide-react";

interface StepMarkdownProps {
  children: string;
}

// ── Xray attachment token handling ────────────────────────────────────────────

/**
 * Xray wiki-markup attachment syntax:
 *   !xray-attachment://<uuid>|width=W,height=H!
 *
 * `react-markdown` treats this as plain text because it is not valid Markdown.
 * We pre-process the raw string: split on attachment tokens, render each chunk
 * separately, and insert a styled placeholder chip in place of each token.
 */
const ATTACHMENT_RE = /!xray-attachment:\/\/([0-9a-f-]+)(?:\|[^!]*)!/gi;

interface AttachmentChip {
  type: "attachment";
  uuid: string;
}

interface TextChunk {
  type: "text";
  value: string;
}

type Segment = TextChunk | AttachmentChip;

function splitAttachments(raw: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  // Reset lastIndex before loop (the regex has the `g` flag).
  ATTACHMENT_RE.lastIndex = 0;

  while ((match = ATTACHMENT_RE.exec(raw)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: raw.slice(lastIndex, match.index) });
    }
    segments.push({ type: "attachment", uuid: match[1] ?? "" });
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after the last match
  if (lastIndex < raw.length) {
    segments.push({ type: "text", value: raw.slice(lastIndex) });
  }

  return segments;
}

/** Inline placeholder chip shown where an Xray attachment token was. */
function AttachmentPlaceholder({ uuid }: { uuid: string }) {
  // Show only the first 8 characters of the UUID to keep the chip compact.
  const short = uuid.slice(0, 8);
  return (
    <span
      title={`Xray attachment: ${uuid}`}
      className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400"
    >
      <ImageIcon className="h-3 w-3 flex-shrink-0" />
      {short}…
    </span>
  );
}

// ── Markdown component overrides ──────────────────────────────────────────────

const components: Components = {
  // Paragraphs — inherit size/leading from parent block
  p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,

  // Headings (rare in steps but handle gracefully)
  h1: ({ children }) => <p className="mb-1 text-sm font-bold">{children}</p>,
  h2: ({ children }) => <p className="mb-1 text-sm font-bold">{children}</p>,
  h3: ({ children }) => <p className="mb-1 text-sm font-semibold">{children}</p>,

  // Inline emphasis
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-900 dark:text-slate-100">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,

  // Inline code
  code: ({ children, className }) => {
    const isBlock = Boolean(className);
    if (isBlock) {
      return (
        <code className="block overflow-x-auto rounded bg-slate-100 px-2 py-1.5 font-mono text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-200">
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-200">
        {children}
      </code>
    );
  },

  // Code blocks (fenced)
  pre: ({ children }) => (
    <pre className="mb-1 overflow-x-auto rounded bg-slate-100 px-2 py-1.5 text-xs dark:bg-slate-700">
      {children}
    </pre>
  ),

  // Lists
  ul: ({ children }) => <ul className="mb-1 list-disc pl-4 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-1 list-decimal pl-4 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="mb-0.5 last:mb-0">{children}</li>,

  // Strikethrough (remark-gfm)
  del: ({ children }) => <del className="line-through opacity-60">{children}</del>,

  // Tables (remark-gfm)
  table: ({ children }) => (
    <div className="mb-1 overflow-x-auto">
      <table className="min-w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-100 dark:bg-slate-700">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-slate-200 dark:border-slate-600">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-2 py-1 text-left font-semibold text-slate-700 dark:text-slate-200">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-2 py-1 text-slate-700 dark:text-slate-300">{children}</td>
  ),

  // Blockquote
  blockquote: ({ children }) => (
    <blockquote className="mb-1 border-l-2 border-slate-300 pl-2 italic text-slate-500 dark:border-slate-600 dark:text-slate-400">
      {children}
    </blockquote>
  ),

  // Horizontal rule
  hr: () => <hr className="my-1 border-slate-200 dark:border-slate-600" />,

  // Links — open externally (Tauri handles this via shell plugin)
  a: ({ children, href }) => (
    <a
      href={href}
      className="text-indigo-600 underline hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  ),
};

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Renders markdown content inside a test step field.
 * Uses react-markdown + remark-gfm with scoped Tailwind styles.
 *
 * Xray wiki-markup attachment tokens (`!xray-attachment://UUID|...!`) are
 * detected before markdown parsing and replaced with inline placeholder chips.
 */
export const StepMarkdown = ({ children }: StepMarkdownProps) => {
  // Fast path: no attachment tokens → plain markdown render.
  if (!children.includes("!xray-attachment://")) {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    );
  }

  // Split on attachment tokens and render each segment.
  const segments = splitAttachments(children);

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "attachment") {
          return <AttachmentPlaceholder key={i} uuid={seg.uuid} />;
        }
        // Only render a ReactMarkdown block if there is non-whitespace content.
        if (!seg.value.trim()) return null;
        return (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={components}>
            {seg.value}
          </ReactMarkdown>
        );
      })}
    </>
  );
};
