"use client";

import { IconTool } from "@tabler/icons-react";
import type { UIMessage } from "ai";
import type { Route } from "next";
import Link from "next/link";
import type { ComponentProps } from "react";
import { Streamdown } from "streamdown";

import { cn } from "@foglamp/ui/lib/utils";

// Route relative links (e.g. `/traces/abc`) through next/link for in-app nav;
// open absolute links (docs, external) in a new tab.
const markdownComponents = {
  a: ({ href = "", children, ...rest }: ComponentProps<"a">) => {
    if (href.startsWith("/")) {
      return (
        <Link
          href={href as Route}
          className="font-medium text-primary underline underline-offset-2"
        >
          {children}
        </Link>
      );
    }
    return (
      <a
        {...rest}
        href={href}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-primary underline underline-offset-2"
      >
        {children}
      </a>
    );
  },
  // Flat, chat-native tables — replaces Streamdown's bordered card + toolbar.
  // The wrapper scrolls horizontally so wide tables never break the layout.
  table: ({ children }: ComponentProps<"table">) => (
    <div className="my-3 w-full overflow-x-auto rounded-xl corner-squircle border border-border/60">
      <table className="w-full border-collapse text-xs tabular-nums">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: ComponentProps<"thead">) => (
    <thead className="bg-muted/40 text-muted-foreground">{children}</thead>
  ),
  tr: ({ children }: ComponentProps<"tr">) => (
    <tr className="border-b border-border/40 last:border-0">{children}</tr>
  ),
  th: ({ children }: ComponentProps<"th">) => (
    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }: ComponentProps<"td">) => (
    <td className="px-3 py-1.5 align-top">{children}</td>
  ),
};

// A subtle pill shown while a tool call is in flight or done, so the user can
// see Foggy reaching into their data.
function ToolChip({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex w-fit items-center gap-1.5 ml-3 py-1 text-xs text-muted-foreground">
      <IconTool
        className={cn(
          "size-3 shrink-0 fill-current stroke-0",
          !done && "animate-pulse"
        )}
      />
      {done ? "Looked up" : "Looking up"} {label}
    </div>
  );
}

// Turn `tool-listTraces` / `dynamic-tool` into a human label.
function toolLabel(type: string, part: Record<string, unknown>): string {
  const name =
    type === "dynamic-tool"
      ? String(part.toolName ?? "data")
      : type.replace(/^tool-/, "");
  return name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

export function FoggyMessage({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5",
        isUser ? "items-end" : "items-start"
      )}
    >
      {message.parts.map((part, i) => {
        const key = `${message.id}-${i}`;

        if (part.type === "text") {
          if (!part.text) return null;
          return isUser ? (
            <div
              key={key}
              className="max-w-[85%] whitespace-pre-wrap rounded-3xl corner-squircle bg-muted px-3 py-2 text-sm text-primary"
            >
              {part.text}
            </div>
          ) : (
            <div
              key={key}
              className="max-w-[90%] px-3 py-0 text-sm leading-relaxed [&_li]:my-0.5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_pre]:my-2 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 *:first:mt-0 *:last:mb-0"
            >
              <Streamdown
                components={markdownComponents}
                controls={{ table: false }}
              >
                {part.text}
              </Streamdown>
            </div>
          );
        }

        if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
          const p = part as unknown as Record<string, unknown>;
          const done =
            p.state === "output-available" || p.state === "output-error";
          return (
            <ToolChip key={key} label={toolLabel(part.type, p)} done={done} />
          );
        }

        return null;
      })}
    </div>
  );
}
