"use client";

import type { PosterData } from "@foglamp/contracts/poster";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { FlowMap } from "./FlowMap";
import { LeftRail } from "./LeftRail";
import { ShareBar } from "./ShareBar";
import "./poster.css";

const BOARD_W = 1600;
const BOARD_H = 1000;

type Theme = "light" | "dark";

// Scale the fixed-size board down to fit the viewport for on-screen preview. The
// PNG export re-renders at the board's true size, so this is purely cosmetic.
function useFitScale() {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => {
      const s = Math.min(
        (window.innerWidth - 64) / BOARD_W,
        (window.innerHeight - 132) / BOARD_H,
        1,
      );
      setScale(Math.max(s, 0.2));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return scale;
}

export function PosterBoard({ data }: { data: PosterData }) {
  const [theme, setTheme] = useState<Theme>("light");
  const scale = useFitScale();
  const boardRef = useRef<HTMLDivElement>(null);

  // Honor the OS preference on first paint (client-only; avoids hydration drift).
  useEffect(() => {
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) setTheme("dark");
  }, []);

  return (
    <div className="poster-root" data-theme={theme}>
      <div className="poster-stage" style={{ transform: `scale(${scale})` }}>
        <div className="poster-board" ref={boardRef} style={{ width: BOARD_W, height: BOARD_H }}>
          <LeftRail data={data} />
          <FlowMap graph={data.graph} />
        </div>
      </div>
      <ShareBar
        boardRef={boardRef}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        fileName={`${data.project.slug}-codebase-poster`}
        shareText={`${data.project.name} — codebase map`}
      />
    </div>
  );
}
