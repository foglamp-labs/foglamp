// How it works, in three steps, each with a small line illustration. No cards,
// no demo (the hero already has one) — just type and drawings.
// Arts: chat input (copy), diff (agent wires it), dashboard (see everything).

// ─── Step illustrations ───────────────────────────────────────────────────────
// 320x150 viewBox, theme colors, one accent per drawing. The "card" of each
// drawing is a real div carrying the house Card shadow (--custom-shadow); the
// SVG overlays the innards. The container is aspect-locked to the viewBox so
// preserveAspectRatio="none" introduces no distortion.

function PromptArt() {
  return (
    <div aria-hidden className="relative aspect-[32/15] w-full">
      {/* the input, as a real surface so it casts the Card shadow */}
      <div
        className="absolute rounded-full corner-squircle bg-card shadow-(--custom-shadow)"
        style={{ left: "3.75%", right: "3.75%", top: "37.3%", height: "37.3%" }}
      />
      <svg
        viewBox="0 0 320 150"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        {/* floating file chip above the input */}
        <rect
          x="14"
          y="18"
          width="92"
          height="22"
          rx="11"
          fill="var(--muted)"
          opacity="0.45"
        />
        <circle cx="29" cy="29" r="4" fill="#f97316" opacity="0.85" />
        <rect
          x="40"
          y="26"
          width="54"
          height="6"
          rx="3"
          fill="var(--muted-foreground)"
          opacity="0.5"
        />

        {/* prompt text */}
        <rect
          x="36"
          y="78"
          width="150"
          height="7"
          rx="3.5"
          fill="var(--muted-foreground)"
          opacity="0.55"
        />
        <rect
          x="194"
          y="78"
          width="26"
          height="7"
          rx="3.5"
          fill="var(--muted-foreground)"
          opacity="0.3"
        />
        {/* caret */}
        <rect x="228" y="74" width="2.5" height="15" fill="#f97316">
          <animate
            attributeName="opacity"
            values="1;0;1"
            dur="1.2s"
            repeatCount="indefinite"
          />
        </rect>

        {/* send */}
        <defs>
          <linearGradient id="hiw-p-send" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fb923c" />
            <stop offset="1" stopColor="#ea580c" />
          </linearGradient>
        </defs>
        <circle cx="280" cy="84" r="17" fill="url(#hiw-p-send)" />
        <path
          d="M 280 92 v -15 m 0 0 l -5.5 5.5 m 5.5 -5.5 l 5.5 5.5"
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* reflection line under the input */}
        <rect
          x="110"
          y="126"
          width="100"
          height="7"
          rx="3.5"
          fill="var(--muted)"
          opacity="0.35"
        />
      </svg>
    </div>
  );
}

function WireArt() {
  return (
    <div aria-hidden className="relative aspect-[32/15] w-full">
      {/* the frame, as a real surface so it casts the Card shadow */}
      <div
        className="absolute overflow-hidden rounded-3xl corner-squircle bg-card shadow-(--custom-shadow)"
        style={{ left: "3.75%", right: "3.75%", top: "8%", bottom: "8%" }}
      />
      <svg
        viewBox="0 0 320 150"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        {/* file tab */}
        <rect
          x="28"
          y="26"
          width="86"
          height="18"
          rx="9"
          fill="var(--muted)"
          opacity="0.55"
        />
        <circle cx="42" cy="35" r="3.5" fill="#3b82f6" opacity="0.8" />
        <rect
          x="52"
          y="32"
          width="52"
          height="6"
          rx="3"
          fill="var(--muted-foreground)"
          opacity="0.5"
        />

        {/* context line */}
        <rect
          x="46"
          y="58"
          width="170"
          height="7"
          rx="3.5"
          fill="var(--muted)"
        />
        <rect
          x="30"
          y="58"
          width="8"
          height="7"
          rx="3"
          fill="var(--muted)"
          opacity="0.4"
        />

        {/* added lines */}
        <g>
          <rect
            x="24"
            y="73"
            width="272"
            height="19"
            rx="6"
            fill="#22c55e"
            opacity="0.1"
          />
          <text x="32" y="87" fontSize="12" fontWeight="700" fill="#22c55e">
            +
          </text>
          <rect
            x="48"
            y="79"
            width="58"
            height="7"
            rx="3.5"
            fill="#22c55e"
            opacity="0.8"
          />
          <rect
            x="112"
            y="79"
            width="46"
            height="7"
            rx="3.5"
            fill="#f97316"
            opacity="0.85"
          />
          <rect
            x="164"
            y="79"
            width="70"
            height="7"
            rx="3.5"
            fill="#22c55e"
            opacity="0.45"
          />
        </g>
        <g>
          <rect
            x="24"
            y="95"
            width="272"
            height="19"
            rx="6"
            fill="#22c55e"
            opacity="0.1"
          />
          <text x="32" y="109" fontSize="12" fontWeight="700" fill="#22c55e">
            +
          </text>
          <rect
            x="48"
            y="101"
            width="38"
            height="7"
            rx="3.5"
            fill="#22c55e"
            opacity="0.8"
          />
          <rect
            x="92"
            y="101"
            width="64"
            height="7"
            rx="3.5"
            fill="#8b5cf6"
            opacity="0.65"
          />
          <rect
            x="162"
            y="101"
            width="30"
            height="7"
            rx="3.5"
            fill="#22c55e"
            opacity="0.45"
          />
        </g>

        {/* trailing context */}
        <rect
          x="46"
          y="122"
          width="120"
          height="7"
          rx="3.5"
          fill="var(--muted)"
        />
        <rect
          x="30"
          y="122"
          width="8"
          height="7"
          rx="3"
          fill="var(--muted)"
          opacity="0.4"
        />
      </svg>
    </div>
  );
}

function LightArt() {
  return (
    <div aria-hidden className="relative aspect-[32/15] w-full">
      {/* the frame, as a real surface so it casts the Card shadow */}
      <div
        className="absolute overflow-hidden rounded-3xl corner-squircle bg-card shadow-(--custom-shadow)"
        style={{ left: "3.75%", right: "3.75%", top: "8%", bottom: "8%" }}
      />
      <svg
        viewBox="0 0 320 150"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        {/* stat tiles */}
        {[
          { x: 26, label: 30, bar: 22, color: "#f97316" },
          { x: 122, label: 36, bar: 28, color: "#3b82f6" },
          { x: 218, label: 26, bar: 18, color: "#22c55e" },
        ].map((t) => (
          <g key={t.x}>
            <rect
              x={t.x}
              y="26"
              width="76"
              height="34"
              rx="9"
              fill="var(--muted)"
              opacity="0.4"
            />
            <rect
              x={t.x + 10}
              y="35"
              width={t.label}
              height="4.5"
              rx="2.25"
              fill="var(--muted-foreground)"
              opacity="0.6"
            />
            <rect
              x={t.x + 10}
              y="46"
              width={t.bar}
              height="5.5"
              rx="2.75"
              fill={t.color}
              opacity="0.9"
            />
          </g>
        ))}

        {/* area chart */}
        <defs>
          <linearGradient id="hiw-s-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f97316" stopOpacity="0.28" />
            <stop offset="1" stopColor="#f97316" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M 26 122 C 56 118 70 104 96 108 S 140 92 166 96 S 224 78 252 82 L 294 74 L 294 128 L 26 128 Z"
          fill="url(#hiw-s-area)"
        />
        <path
          d="M 26 122 C 56 118 70 104 96 108 S 140 92 166 96 S 224 78 252 82 L 294 74"
          fill="none"
          stroke="#f97316"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <circle
          cx="294"
          cy="74"
          r="4.5"
          fill="#f97316"
          stroke="var(--card)"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}

const STEPS = [
  {
    n: "1",
    title: "Copy the prompt",
    body: "One click. The prompt has everything your coding agent needs.",
    Art: PromptArt,
  },
  {
    n: "2",
    title: "Your agent sets it up",
    body: "It finds your AI calls and plugs Foglamp in. You review the diff.",
    Art: WireArt,
  },
  {
    n: "3",
    title: "See everything",
    body: "Open the dashboard. Every call is there: what it cost, how long it took, what it said.",
    Art: LightArt,
  },
] as const;

export function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-7xl px-5 sm:px-8">
      <h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        Set up in one prompt.
      </h2>
      <p className="mt-3 max-w-md text-muted-foreground text-pretty">
        Just hand it to Claude Code or Codex and get going.
      </p>

      <div className="mt-16 grid gap-12 md:grid-cols-3 md:gap-20">
        {STEPS.map((step) => (
          <div key={step.n}>
            <step.Art />
            <h3 className="mt-5 font-display text-lg font-semibold tracking-tight">
              <span className="mr-2 text-muted-foreground/60">{step.n}</span>
              {step.title}
            </h3>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground text-pretty">
              {step.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
