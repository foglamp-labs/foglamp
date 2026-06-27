"use client";

import {
  IconBrandX,
  IconCheck,
  IconDownload,
  IconLink,
  IconMoon,
  IconSun,
} from "@tabler/icons-react";
import { type RefObject, useState } from "react";

export function ShareBar({
  boardRef,
  theme,
  onToggleTheme,
  fileName,
  shareText,
}: {
  boardRef: RefObject<HTMLElement | null>;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  fileName: string;
  shareText: string;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function download() {
    const el = boardRef.current;
    if (!el) return;
    setBusy(true);
    try {
      await document.fonts.ready;
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(el, {
        pixelRatio: 2,
        cacheBust: true,
        width: el.offsetWidth,
        height: el.offsetHeight,
        style: { transform: "none" },
      });
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable
    }
  }

  function shareToX() {
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(
      shareText,
    )}&url=${encodeURIComponent(window.location.href)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="controls">
      <button className="ctrl" onClick={copyLink}>
        {copied ? <IconCheck size={16} stroke={2} /> : <IconLink size={16} stroke={2} />}
        {copied ? "Copied" : "Copy link"}
      </button>
      <button className="ctrl" onClick={shareToX}>
        <IconBrandX size={16} stroke={2} />
        Share
      </button>
      <button className="ctrl" onClick={download} disabled={busy}>
        <IconDownload size={16} stroke={2} />
        {busy ? "Rendering…" : "Download PNG"}
      </button>
      <button className="ctrl ctrl-icon" onClick={onToggleTheme} title="Toggle theme">
        {theme === "dark" ? <IconSun size={16} stroke={2} /> : <IconMoon size={16} stroke={2} />}
      </button>
    </div>
  );
}
