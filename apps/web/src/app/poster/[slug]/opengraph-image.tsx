import { type PosterData, validatePoster } from "@foglamp/contracts/poster";
import { env } from "@foglamp/env/web";
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Codebase map — Foglamp";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function loadPoster(slug: string): Promise<PosterData | null> {
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SERVER_URL}/poster/${encodeURIComponent(slug)}`);
    if (!res.ok) return null;
    const parsed = validatePoster(await res.json());
    return parsed.ok ? parsed.data : null;
  } catch {
    return null;
  }
}

// Fetch a single static weight of Inter from Google Fonts for Satori (it can't
// use CSS variables / variable woff2). Common, reliable OG pattern.
async function interFont(weight: 400 | 600 | 700): Promise<ArrayBuffer> {
  const css = await (
    await fetch(`https://fonts.googleapis.com/css2?family=Inter:wght@${weight}`)
  ).text();
  const url = css.match(/src: url\((.+?)\) format/)?.[1];
  if (!url) throw new Error("font parse failed");
  return (await fetch(url)).arrayBuffer();
}

const ACCENT = "#ff5513";

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadPoster(slug);
  const [regular, semibold, bold] = await Promise.all([
    interFont(400),
    interFont(600),
    interFont(700),
  ]);
  const fonts = [
    { name: "Inter", data: regular, weight: 400 as const },
    { name: "Inter", data: semibold, weight: 600 as const },
    { name: "Inter", data: bold, weight: 700 as const },
  ];

  const name = data?.project.name ?? "Codebase Poster";
  const tagline = data?.project.tagline ?? "How this codebase uses AI";
  const stats = data?.stats ?? { agents: 0, models: 0, tools: 0, integrations: 0 };
  const models = data?.topModels.map((m) => m.label).join("  ·  ") ?? "";

  const statItems: [number, string][] = [
    [stats.agents, "Agents"],
    [stats.models, "Models"],
    [stats.tools, "Tools"],
    [stats.integrations, "Integrations"],
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0b0b0d",
          color: "#f3f3f5",
          padding: 72,
          fontFamily: "Inter",
        }}
      >
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex" }}>
              <div style={{ display: "flex", width: 26, height: 26, borderRadius: 13, background: "#ededed" }} />
              <div style={{ display: "flex", width: 26, height: 26, borderRadius: 13, background: "#0090fd", marginLeft: -10 }} />
              <div style={{ display: "flex", width: 26, height: 26, borderRadius: 13, background: ACCENT, marginLeft: -10 }} />
            </div>
            <div style={{ display: "flex", fontSize: 28, fontWeight: 700 }}>foglamp</div>
          </div>
          <div style={{ display: "flex", fontSize: 20, letterSpacing: 3, color: "#8b8b93", fontWeight: 600 }}>
            CODEBASE MAP
          </div>
        </div>

        {/* title */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", height: 6, width: 64, background: ACCENT, borderRadius: 3 }} />
          <div style={{ display: "flex", fontSize: 84, fontWeight: 700, lineHeight: 1, letterSpacing: -2 }}>{name}</div>
          <div style={{ display: "flex", fontSize: 30, color: "#a1a1aa" }}>{tagline}</div>
          {models ? <div style={{ display: "flex", fontSize: 22, color: "#71717a" }}>{models}</div> : null}
        </div>

        {/* stats */}
        <div style={{ display: "flex", gap: 56 }}>
          {statItems.map(([value, label]) => (
            <div key={label} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 48, fontWeight: 600 }}>{value}</div>
              <div style={{ display: "flex", fontSize: 18, letterSpacing: 2, color: "#71717a", textTransform: "uppercase" }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
