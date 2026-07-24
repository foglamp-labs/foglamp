import {
  type Icon,
  IconDownload,
  IconList,
  IconSearch,
  IconTool,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";

// Icon by tool-name convention — mirrors the HUD's toolGlyph(): search/find/
// query/lookup, list/ls/index/all, and get/fetch/read/load get a recognizable
// icon; everything else falls back to the generic wrench.
function toolIcon(name: string): Icon {
  const n = name.toLowerCase();
  if (/^(search|find|query|lookup)/.test(n)) return IconSearch;
  if (/^(list|ls|index|all)/.test(n)) return IconList;
  if (/^(get|fetch|read|load)/.test(n)) return IconDownload;
  return IconTool;
}

/** A tool's icon, picked from its name. Only the wrench fallback is filled —
 * the named variants are outline glyphs and would render as blobs. */
export function ToolIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Glyph = toolIcon(name);
  return <Glyph className={cn(className)} />;
}
