import { type ScanData, validateScan } from "@foglamp/contracts/scan";
import { env } from "@foglamp/env/web";
import { ImageResponse } from "next/og";

import { type FoldedNode, foldGraph } from "@/components/scan/fold-graph";
import { edgePath, layoutGraph } from "@/components/scan/layout";
import { getGoogleFavicon } from "@/lib/favicon";

// elkjs needs a real JS runtime (it fakes a Worker in-process) — run on Node.
export const runtime = "nodejs";
export const alt = "Codebase scan — Foglamp";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0b0b0d";
const CARD = "#1a1a1e";
const KIND_HEX: Record<string, string> = {
  entry: "#64748b",
  cron: "#f59e0b",
  agent: "#f97316",
  model: "#3b82f6",
  tool: "#8b5cf6",
  store: "#10b981",
  external: "#0ea5e9",
};

// Mirrors FlowMap's sizing so the OG map matches the live one.
const HEAD_H = 56;
const CHIP_ROW_H = 24;
const nodeHeight = (n: FoldedNode) =>
  n.embeds.length === 0 ? HEAD_H : HEAD_H + n.embeds.length * CHIP_ROW_H + 12;

async function loadScan(slug: string): Promise<ScanData | null> {
  try {
    const res = await fetch(
      `${env.NEXT_PUBLIC_SERVER_URL}/scan/${encodeURIComponent(slug)}`
    );
    if (!res.ok) return null;
    const parsed = validateScan(await res.json());
    return parsed.ok ? parsed.data : null;
  } catch {
    return null;
  }
}

async function fetchGoogleFont(
  family: string,
  weight: number
): Promise<ArrayBuffer> {
  const css = await (
    await fetch(
      `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`
    )
  ).text();
  const url = css.match(/src: url\((.+?)\) format/)?.[1];
  if (!url) throw new Error("font parse failed");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font fetch ${res.status}`);
  return res.arrayBuffer();
}

// Cached across requests, with one retry — a single flaky Google Fonts fetch
// on a cold instance shouldn't 500 the whole unfurl.
const fontCache = new Map<string, Promise<ArrayBuffer>>();
function googleFont(family: string, weight: number): Promise<ArrayBuffer> {
  const key = `${family}:${weight}`;
  const cached = fontCache.get(key);
  if (cached) return cached;
  const p = fetchGoogleFont(family, weight).catch(() =>
    fetchGoogleFont(family, weight)
  );
  p.catch(() => fontCache.delete(key));
  fontCache.set(key, p);
  return p;
}

// Satori is unreliable with remote <img> URLs — prefetch every favicon and
// inline it as a data URI instead.
async function fetchIconDataUri(domain: string): Promise<string | null> {
  try {
    const res = await fetch(getGoogleFavicon(domain));
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/png";
    const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
    return `data:${type};base64,${b64}`;
  } catch {
    return null;
  }
}

async function buildIconMap(domains: (string | undefined)[]) {
  const unique = [...new Set(domains.filter((d): d is string => !!d))];
  const entries = await Promise.all(
    unique.map(async (d) => [d, await fetchIconDataUri(d)] as const)
  );
  return new Map(entries.filter(([, v]) => v !== null) as [string, string][]);
}

function NodeIcon({
  domain,
  kind,
  icons,
  s,
}: {
  domain?: string;
  kind: string;
  icons: Map<string, string>;
  s: (v: number) => number;
}) {
  const hex = KIND_HEX[kind] ?? "#64748b";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: s(34),
        height: s(34),
        borderRadius: s(12),
        background: `${hex}26`,
        flexShrink: 0,
      }}
    >
      {domain && icons.get(domain) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={icons.get(domain)}
          alt=""
          width={s(18)}
          height={s(18)}
          style={{ borderRadius: s(4) }}
        />
      ) : (
        <div
          style={{
            display: "flex",
            width: s(12),
            height: s(12),
            borderRadius: s(6),
            background: hex,
          }}
        />
      )}
    </div>
  );
}

export default async function OgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadScan(slug);
  const [regular, semibold, bold, display] = await Promise.all([
    googleFont("Inter", 400),
    googleFont("Inter", 600),
    googleFont("Inter", 700),
    googleFont("Host Grotesk", 600),
  ]);
  const fonts = [
    { name: "Inter", data: regular, weight: 400 as const },
    { name: "Inter", data: semibold, weight: 600 as const },
    { name: "Inter", data: bold, weight: 700 as const },
    { name: "Host Grotesk", data: display, weight: 600 as const },
  ];

  const name = data?.project.name ?? "Codebase Scan";
  const iconDomain = data?.project.iconDomain;

  // Lay the real graph out exactly like the live page (fold + ELK).
  const folded = data ? foldGraph(data.graph) : { nodes: [], edges: [] };
  const degree = new Map<string, number>();
  for (const e of folded.edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  const layout = await layoutGraph(
    folded.nodes.map((n) => ({
      ...n,
      width: 208 + Math.min(degree.get(n.id) ?? 0, 6) * 7,
      height: nodeHeight(n),
    })),
    folded.edges
  );

  const icons = await buildIconMap([
    iconDomain,
    ...folded.nodes.map((n) => n.domain),
    ...folded.nodes.flatMap((n) => n.embeds.map((em) => em.domain)),
  ]);

  // Scale so the map bleeds a little past both sides; the grid bg fills any
  // vertical slack, so width drives the fit and more of the map stays visible.
  const HEADER_H = 118;
  const mapAreaH = size.height - HEADER_H;
  const k = Math.min(1.1, (size.width + 90) / Math.max(1, layout.width));
  const mapW = layout.width * k;
  const mapH = layout.height * k;
  const mapLeft = (size.width - mapW) / 2;
  // Center vertically in the map area when it fits; bleed off the bottom when
  // it doesn't.
  const mapTop =
    mapH >= mapAreaH ? HEADER_H : HEADER_H + (mapAreaH - mapH) / 2;
  // Satori drops <img> elements inside `transform: scale()` subtrees, so the
  // map is scaled by hand: every geometry/font value goes through s().
  const s = (v: number) => v * k;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: BG,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          color: "#f3f3f5",
          fontFamily: "Inter",
          overflow: "hidden",
        }}
      >
        {/* header — project lockup left, foglamp mark right */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: HEADER_H,
            padding: "0 56px",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {iconDomain && icons.get(iconDomain) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={icons.get(iconDomain)}
                alt=""
                width={38}
                height={38}
                style={{ borderRadius: 10 }}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.14)",
                  fontSize: 20,
                  fontWeight: 700,
                }}
              >
                {name.charAt(0)}
              </div>
            )}
            <div
              style={{
                display: "flex",
                fontSize: 34,
                fontWeight: 600,
                letterSpacing: -0.5,
                fontFamily: "Host Grotesk",
              }}
            >
              {name}
            </div>
          </div>
          <div style={{ display: "flex" }}>
            <div style={{ display: "flex", width: 24, height: 24, borderRadius: 12, background: "#ededed" }} />
            <div style={{ display: "flex", width: 24, height: 24, borderRadius: 12, background: "#0090fd", marginLeft: -9 }} />
            <div style={{ display: "flex", width: 24, height: 24, borderRadius: 12, background: "#ff5513", marginLeft: -9 }} />
          </div>
        </div>

        {/* the actual map, scaled to bleed off both sides and the bottom */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: mapLeft,
            top: mapTop,
            width: mapW,
            height: mapH,
          }}
        >
          {/* edges — viewBox in layout units, element scaled to k */}
          <svg
            width={mapW}
            height={s(layout.height)}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            style={{ position: "absolute", top: 0, left: 0 }}
          >
            {layout.edges.map((e, i) => (
              <path
                key={i}
                d={edgePath(e.points)}
                fill="none"
                stroke="#3f3f46"
                strokeWidth={1.5}
              />
            ))}
          </svg>

          {/* group containers */}
          {layout.groups.map((g) => (
            <div
              key={g.id}
              style={{
                display: "flex",
                position: "absolute",
                left: s(g.x),
                top: s(g.y),
                width: s(g.width),
                height: s(g.height),
                borderRadius: s(24),
                border: "1px solid rgba(255,255,255,0.07)",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  position: "absolute",
                  top: s(16),
                  left: s(20),
                  fontSize: s(11),
                  fontWeight: 600,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  color: "#71717a",
                }}
              >
                {g.label}
              </div>
            </div>
          ))}

          {/* nodes */}
          {layout.nodes.map((n) => (
            <div
              key={n.id}
              style={{
                display: "flex",
                flexDirection: "column",
                position: "absolute",
                left: s(n.x),
                top: s(n.y),
                width: s(n.width),
                height: s(n.height),
                borderRadius: s(22),
                background: CARD,
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: s(10),
                  height: s(HEAD_H),
                  padding: `0 ${s(14)}px`,
                  flexShrink: 0,
                }}
              >
                <NodeIcon domain={n.domain} kind={n.kind} icons={icons} s={s} />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", fontSize: s(14), fontWeight: 600, lineHeight: 1.25 }}>
                    {n.label}
                  </div>
                  {n.sub ? (
                    <div style={{ display: "flex", fontSize: s(11.5), color: "#8b8b93", lineHeight: 1.25 }}>
                      {n.sub}
                    </div>
                  ) : null}
                </div>
              </div>
              {n.embeds.length > 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: s(8),
                    margin: `0 ${s(16)}px`,
                    paddingTop: s(10),
                    borderTop: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {n.embeds.map((em) => (
                    <div
                      key={em.id}
                      style={{ display: "flex", alignItems: "center", gap: s(6) }}
                    >
                      {em.domain && icons.get(em.domain) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={icons.get(em.domain)}
                          alt=""
                          width={s(13)}
                          height={s(13)}
                          style={{ borderRadius: s(3) }}
                        />
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            width: s(9),
                            height: s(9),
                            borderRadius: s(5),
                            background: KIND_HEX[em.kind] ?? "#8b5cf6",
                          }}
                        />
                      )}
                      <div style={{ display: "flex", fontSize: s(11.5), fontWeight: 600 }}>
                        {em.label}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
