import type { ReactNode } from "react";

// Static illustrations share a 600 × 360 drawing surface. HTML annotations
// keep their font size on small screens instead of shrinking with the SVG.
function Drawing({
  description,
  children,
  labels,
}: {
  description: string;
  children: ReactNode;
  labels: ReactNode;
}) {
  return (
    <div
      role="img"
      aria-label={description}
      className="relative isolate aspect-[5/3] w-full min-w-0 text-foreground/65"
    >
      <svg
        viewBox="0 0 600 360"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        aria-hidden="true"
        className="absolute inset-0 size-full [&_circle]:[vector-effect:non-scaling-stroke] [&_ellipse]:[vector-effect:non-scaling-stroke] [&_path]:[vector-effect:non-scaling-stroke]"
      >
        {children}
      </svg>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {labels}
      </div>
    </div>
  );
}

function Annotation({
  x,
  y,
  children,
  className = "",
}: {
  x: number;
  y: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-xs text-muted-foreground ${className}`}
      style={{ left: `${(x / 600) * 100}%`, top: `${(y / 360) * 100}%` }}
    >
      {children}
    </span>
  );
}

function Node({ x, y, selected = false }: { x: number; y: number; selected?: boolean }) {
  return (
    <g className={selected ? "text-foreground" : undefined}>
      <circle cx={x} cy={y} r={selected ? 7 : 4} className="fill-background" />
      {selected && <circle cx={x} cy={y} r="2" className="fill-foreground" stroke="none" />}
    </g>
  );
}

export function CostSchematic() {
  return (
    <Drawing
      description="Illustration: spending from three agents flows into one total of $42.80, below a $50 daily budget."
      labels={
        <>
          <Annotation x={100} y={35}>Agents</Annotation>
          <Annotation x={430} y={180} className="flex flex-col items-center gap-1">
            <span>Total spend</span>
            <span className="text-xl tracking-tight text-foreground sm:text-3xl">$42.80</span>
          </Annotation>
          <Annotation x={530} y={35} className="hidden sm:block">Budget $50</Annotation>
        </>
      }
    >
      <g opacity="0.3">
        <path d="M32 180H342M518 180H568" strokeDasharray="3 6" />
        <path d="M100 60V308" strokeDasharray="3 6" />
        <circle cx="430" cy="180" r="118" strokeDasharray="2 7" />
      </g>
      <path d="M100 80C270 80 260 180 354 180M100 180H354M100 280C270 280 260 180 354 180" />
      {[80, 180, 280].map((y) => (
        <g key={y}>
          <circle cx="100" cy={y} r="23" />
          <Node x={100} y={y} />
        </g>
      ))}
      <circle cx="430" cy="180" r="76" className="text-foreground" />
      <circle cx="430" cy="180" r="104" opacity="0.5" />
      <path d="M354 174V186M348 176V184M342 178V182" />
      <path d="M506 180H550M550 165V195" className="text-foreground" />
      <path d="M530 52V105L550 125V154" strokeDasharray="3 5" opacity="0.5" className="hidden sm:block" />
      <Node x={294} y={180} selected />
    </Drawing>
  );
}

export function TraceSchematic() {
  return (
    <Drawing
      description="Illustration: one connected trace follows a model call, a tool call, and a response. The tool call is highlighted for inspection."
      labels={
        <>
          <Annotation x={128} y={330}>Model</Annotation>
          <Annotation x={300} y={330} className="text-foreground">Tool call</Annotation>
          <Annotation x={472} y={330}>Response</Annotation>
        </>
      }
    >
      <g opacity="0.3">
        <path d="M30 180H570" strokeDasharray="3 6" />
        <path d="M300 28V306" strokeDasharray="3 6" />
      </g>
      <ellipse cx="214" cy="180" rx="86" ry="105" />
      <ellipse cx="386" cy="180" rx="86" ry="105" />
      <ellipse cx="300" cy="180" rx="86" ry="125" opacity="0.4" />
      <path d="M42 180H558" className="text-foreground" />
      <path d="M128 196V306M300 205V306M472 196V306" opacity="0.45" />
      <path d="M40 173V187M46 176V184M552 176V184M558 173V187" />
      <circle cx="300" cy="180" r="21" className="fill-background text-foreground" />
      <Node x={128} y={180} />
      <Node x={300} y={180} selected />
      <Node x={472} y={180} />
      <path d="m195 176 4 4-4 4m206-8 4 4-4 4" />
    </Drawing>
  );
}

export function QualitySchematic() {
  return (
    <Drawing
      description="Illustration: a response quality signal drops below a threshold. The crossing is highlighted and connected to an alert."
      labels={
        <>
          <Annotation x={104} y={68}>Quality</Annotation>
          <Annotation x={110} y={205} className="hidden sm:block">Threshold</Annotation>
          <Annotation x={450} y={76} className="text-foreground">Alert</Annotation>
        </>
      }
    >
      <g opacity="0.3">
        <path d="M40 100H560M40 280H560" strokeDasharray="2 7" />
        <path d="M60 86V298M540 86V298" />
        <path d="M54 100H66M54 280H66M534 100H546M534 280H546" />
      </g>
      <path d="M40 180H560" strokeDasharray="5 6" opacity="0.7" />
      <path d="M60 132C90 132 95 98 120 106S146 153 174 137 201 105 228 124 265 153 290 144 320 137 344 180 369 255 398 241 434 210 458 237 500 267 540 252" className="text-foreground" />
      <circle cx="344" cy="180" r="34" className="text-foreground" />
      <circle cx="344" cy="180" r="57" strokeDasharray="3 6" opacity="0.4" />
      <path d="M368 156L425 99H470" className="text-foreground" />
      <path d="M344 244V300M337 294H351" opacity="0.4" />
      <Node x={344} y={180} selected />
      <Node x={470} y={99} />
    </Drawing>
  );
}
