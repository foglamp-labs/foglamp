"use client";

import type { PosterData } from "@foglamp/contracts/poster";
import type { CSSProperties } from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { Favicon } from "./Brand";
import { KIND_ORDER, KIND_STYLES } from "./kinds";
import { arrowHead, edgePath, layoutGraph, NODE_H, NODE_W } from "./layout";

// Edge color set inline (not via CSS class): html-to-image doesn't reliably
// apply stylesheet rules to SVG paths, so geometry styling must be inline. A
// mid-gray with alpha reads on both light and dark themes.
const EDGE_STROKE = "rgba(120,124,136,0.5)";
const EDGE_STYLE = { fill: "none", stroke: EDGE_STROKE, strokeWidth: 1.6 } as const;

export function FlowMap({ graph }: { graph: PosterData["graph"] }) {
  const layout = useMemo(() => layoutGraph(graph.nodes, graph.edges), [graph]);
  const areaRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => {
      const pad = 8;
      const sx = (el.clientWidth - pad * 2) / layout.width;
      const sy = (el.clientHeight - pad * 2) / layout.height;
      setScale(Math.min(sx, sy, 1.15));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout.width, layout.height]);

  const usedKinds = KIND_ORDER.filter((k) => graph.nodes.some((n) => n.kind === k));

  return (
    <section className="map">
      <div className="map-area" ref={areaRef}>
        <div
          className="graph"
          style={{ width: layout.width, height: layout.height, transform: `scale(${scale})` }}
        >
          <svg className="edges" width={layout.width} height={layout.height} aria-hidden="true">
            {layout.edges.map((e, i) => (
              <g key={i}>
                <path d={edgePath(e.points)} style={EDGE_STYLE} strokeLinecap="round" />
                <path
                  d={arrowHead(e.points)}
                  style={EDGE_STYLE}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            ))}
          </svg>

          {layout.edges.map((e, i) => {
            if (!e.label || e.points.length === 0) return null;
            const mid = e.points[Math.floor(e.points.length / 2)]!;
            return (
              <span key={`l${i}`} className="edge-label" style={{ left: mid.x, top: mid.y }}>
                {e.label}
              </span>
            );
          })}

          {layout.nodes.map((n) => {
            const style = KIND_STYLES[n.kind];
            const Glyph = style.Glyph;
            return (
              <div
                key={n.id}
                className="node"
                style={
                  {
                    left: n.x,
                    top: n.y,
                    width: NODE_W,
                    height: NODE_H,
                    "--kc": `var(${style.colorVar})`,
                  } as CSSProperties
                }
              >
                <span className="node-icon">
                  <Favicon domain={n.domain} size={18} fallback={<Glyph size={18} stroke={2} />} />
                </span>
                <span className="node-text">
                  <span className="node-label">{n.label}</span>
                  {n.sub ? <span className="node-sub">{n.sub}</span> : null}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="legend">
        {usedKinds.map((k) => (
          <span
            key={k}
            className="legend-item"
            style={{ "--kc": `var(${KIND_STYLES[k].colorVar})` } as CSSProperties}
          >
            <i className="legend-dot" />
            {KIND_STYLES[k].label}
          </span>
        ))}
      </div>
    </section>
  );
}
