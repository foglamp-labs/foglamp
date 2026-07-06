// Bake-off: five variations of each how-it-works illustration, rendered in a
// duplicate section so we can pick per step. The winners move into
// how-it-works.tsx and this file dies.
//
// All arts share the 240x110 viewBox, theme colors, and one accent each.

// ─── shared bits ──────────────────────────────────────────────────────────────

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 240 110" className="h-28 w-full" aria-hidden>
      <rect
        x="8"
        y="10"
        width="224"
        height="90"
        rx="14"
        fill="var(--card)"
        stroke="var(--border)"
      />
      {children}
    </svg>
  );
}

function Traffic() {
  return (
    <g opacity="0.7">
      <circle cx="24" cy="24" r="3" fill="#ef4444" />
      <circle cx="35" cy="24" r="3" fill="#f59e0b" />
      <circle cx="46" cy="24" r="3" fill="#22c55e" />
    </g>
  );
}

// ─── Step 1: Copy the prompt ──────────────────────────────────────────────────

// 1A — refined current: window, header rule, lines, gradient pill + cursor.
function P1() {
  return (
    <Frame>
      <line x1="8" y1="34" x2="232" y2="34" stroke="var(--border)" />
      <Traffic />
      <rect x="26" y="46" width="150" height="6" rx="3" fill="var(--muted)" />
      <rect x="26" y="60" width="180" height="6" rx="3" fill="var(--muted)" />
      <rect x="26" y="74" width="110" height="6" rx="3" fill="var(--muted)" />
      <defs>
        <linearGradient id="p1g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fb923c" />
          <stop offset="1" stopColor="#f97316" />
        </linearGradient>
      </defs>
      <rect x="152" y="68" width="62" height="22" rx="11" fill="url(#p1g)" />
      <text x="176" y="82" textAnchor="middle" fontSize="10" fontWeight="600" fill="#fff">
        Copy
      </text>
      {/* cursor */}
      <path
        d="M 206 84 l 4.5 12 2.2 -4.8 4.8 -2.2 z"
        fill="var(--foreground)"
        stroke="var(--background)"
        strokeWidth="1"
      />
    </Frame>
  );
}

// 1B — chat input: one rounded field with the prompt inside, orange send.
function P2() {
  return (
    <svg viewBox="0 0 240 110" className="h-28 w-full" aria-hidden>
      <rect x="18" y="20" width="120" height="8" rx="4" fill="var(--muted)" opacity="0.6" />
      <rect
        x="8"
        y="38"
        width="224"
        height="40"
        rx="20"
        fill="var(--card)"
        stroke="var(--border)"
      />
      <rect x="26" y="55" width="128" height="6" rx="3" fill="var(--muted-foreground)" opacity="0.5" />
      <rect x="160" y="55" width="2.5" height="10" fill="#f97316">
        <animate attributeName="opacity" values="1;0;1" dur="1.2s" repeatCount="indefinite" />
      </rect>
      <circle cx="212" cy="58" r="13" fill="#f97316" />
      <path
        d="M 212 64 v -11 m 0 0 l -4.5 4.5 m 4.5 -4.5 l 4.5 4.5"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <rect x="86" y="88" width="70" height="8" rx="4" fill="var(--muted)" opacity="0.45" />
    </svg>
  );
}

// 1C — terminal: traffic lights, prompt line pasted, block cursor.
function P3() {
  return (
    <Frame>
      <Traffic />
      <text x="24" y="52" fontSize="11" fontFamily="var(--font-geist-mono, monospace)" fill="#f97316">
        ❯
      </text>
      <rect x="38" y="45" width="130" height="6" rx="3" fill="var(--foreground)" opacity="0.75" />
      <rect x="38" y="61" width="96" height="6" rx="3" fill="var(--muted)" />
      <rect x="38" y="77" width="60" height="6" rx="3" fill="var(--muted)" />
      <rect x="104" y="74" width="7" height="12" fill="#f97316">
        <animate attributeName="opacity" values="1;0;1" dur="1.1s" repeatCount="indefinite" />
      </rect>
    </Frame>
  );
}

// 1D — selection: prompt text inside a dashed marquee, copy badge on corner.
function P4() {
  return (
    <Frame>
      <rect x="26" y="26" width="140" height="6" rx="3" fill="var(--muted)" />
      <rect
        x="20"
        y="40"
        width="200"
        height="44"
        rx="8"
        fill="#f97316"
        opacity="0.07"
      />
      <rect
        x="20"
        y="40"
        width="200"
        height="44"
        rx="8"
        fill="none"
        stroke="#f97316"
        strokeWidth="1.2"
        strokeDasharray="5 4"
      />
      <rect x="32" y="50" width="160" height="6" rx="3" fill="var(--muted-foreground)" opacity="0.55" />
      <rect x="32" y="64" width="120" height="6" rx="3" fill="var(--muted-foreground)" opacity="0.55" />
      <g>
        <rect x="196" y="28" width="36" height="24" rx="12" fill="#f97316" />
        <rect x="207" y="35" width="8" height="10" rx="2" fill="none" stroke="#fff" strokeWidth="1.5" />
        <rect x="211" y="32" width="8" height="10" rx="2" fill="#f97316" stroke="#fff" strokeWidth="1.5" />
      </g>
    </Frame>
  );
}

// 1E — clipboard: the artifact itself, with a check for "copied".
function P5() {
  return (
    <svg viewBox="0 0 240 110" className="h-28 w-full" aria-hidden>
      <rect
        x="84"
        y="16"
        width="72"
        height="86"
        rx="10"
        fill="var(--card)"
        stroke="var(--border)"
      />
      <rect x="106" y="10" width="28" height="12" rx="5" fill="var(--muted)" stroke="var(--border)" />
      <rect x="98" y="38" width="44" height="5" rx="2.5" fill="var(--muted)" />
      <rect x="98" y="51" width="34" height="5" rx="2.5" fill="var(--muted)" />
      <rect x="98" y="64" width="40" height="5" rx="2.5" fill="var(--muted)" />
      <circle cx="148" cy="88" r="13" fill="#f97316" stroke="var(--background)" strokeWidth="3" />
      <path
        d="M 142.5 88 l 4 4 l 7 -8"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

// ─── Step 2: Your agent sets it up ────────────────────────────────────────────

// 2A — refined diff: file tab, context lines, two adds with token colors.
function W1() {
  return (
    <Frame>
      <rect x="20" y="18" width="58" height="12" rx="6" fill="var(--muted)" opacity="0.6" />
      <rect x="26" y="40" width="130" height="5" rx="2.5" fill="var(--muted)" />
      <g>
        <rect x="20" y="52" width="200" height="14" rx="4" fill="#22c55e" opacity="0.1" />
        <text x="27" y="63" fontSize="10" fontWeight="700" fill="#22c55e">+</text>
        <rect x="40" y="56" width="46" height="6" rx="3" fill="#22c55e" opacity="0.75" />
        <rect x="92" y="56" width="34" height="6" rx="3" fill="#f97316" opacity="0.75" />
        <rect x="132" y="56" width="52" height="6" rx="3" fill="#22c55e" opacity="0.45" />
      </g>
      <g>
        <rect x="20" y="68" width="200" height="14" rx="4" fill="#22c55e" opacity="0.1" />
        <text x="27" y="79" fontSize="10" fontWeight="700" fill="#22c55e">+</text>
        <rect x="40" y="72" width="30" height="6" rx="3" fill="#22c55e" opacity="0.75" />
        <rect x="76" y="72" width="52" height="6" rx="3" fill="#8b5cf6" opacity="0.6" />
      </g>
      <rect x="26" y="88" width="100" height="5" rx="2.5" fill="var(--muted)" />
    </Frame>
  );
}

// 2B — agent log: terminal of steps, each ticked, last one glowing.
function W2() {
  return (
    <Frame>
      <Traffic />
      <g>
        <circle cx="28" cy="46" r="3.5" fill="#22c55e" opacity="0.9" />
        <rect x="40" y="43" width="120" height="6" rx="3" fill="var(--muted)" />
      </g>
      <g>
        <circle cx="28" cy="62" r="3.5" fill="#22c55e" opacity="0.9" />
        <rect x="40" y="59" width="150" height="6" rx="3" fill="var(--muted)" />
      </g>
      <g>
        <circle cx="28" cy="78" r="3.5" fill="#f97316">
          <animate attributeName="opacity" values="1;0.35;1" dur="1.6s" repeatCount="indefinite" />
        </circle>
        <rect x="40" y="75" width="90" height="6" rx="3" fill="var(--foreground)" opacity="0.7" />
      </g>
    </Frame>
  );
}

// 2C — before/after: plain code block, arrow, same block with the orange wrap.
function W3() {
  return (
    <svg viewBox="0 0 240 110" className="h-28 w-full" aria-hidden>
      <rect x="10" y="28" width="88" height="54" rx="10" fill="var(--card)" stroke="var(--border)" />
      <rect x="20" y="40" width="56" height="5" rx="2.5" fill="var(--muted)" />
      <rect x="20" y="52" width="66" height="5" rx="2.5" fill="var(--muted)" />
      <rect x="20" y="64" width="44" height="5" rx="2.5" fill="var(--muted)" />
      <path d="M 106 55 h 22 m 0 0 l -5 -5 m 5 5 l -5 5" stroke="var(--muted-foreground)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <rect x="142" y="28" width="88" height="54" rx="10" fill="var(--card)" stroke="#f97316" strokeOpacity="0.55" />
      <rect x="152" y="40" width="56" height="5" rx="2.5" fill="var(--muted)" />
      <rect x="152" y="52" width="40" height="5" rx="2.5" fill="#f97316" opacity="0.8" />
      <rect x="152" y="64" width="44" height="5" rx="2.5" fill="var(--muted)" />
      <circle cx="230" cy="28" r="7" fill="#f97316" stroke="var(--background)" strokeWidth="2.5" />
    </svg>
  );
}

// 2D — wiring: your app, a cable, the foglamp mark. Plugged in.
function W4() {
  return (
    <svg viewBox="0 0 240 110" className="h-28 w-full" aria-hidden>
      <rect x="12" y="34" width="76" height="42" rx="10" fill="var(--card)" stroke="var(--border)" />
      <rect x="24" y="46" width="40" height="5" rx="2.5" fill="var(--muted)" />
      <rect x="24" y="58" width="52" height="5" rx="2.5" fill="var(--muted)" />
      <path
        d="M 88 55 C 120 55 120 55 150 55"
        stroke="#f97316"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="3 6"
        fill="none"
      >
        <animate attributeName="stroke-dashoffset" values="0;-18" dur="1.4s" repeatCount="indefinite" />
      </path>
      <g>
        <circle cx="176" cy="55" r="12" fill="#ededed" />
        <circle cx="190" cy="55" r="12" fill="#0090fd" />
        <circle cx="204" cy="55" r="12" fill="#ff5513" />
      </g>
    </svg>
  );
}

// 2E — pull request: branch glyph, +2 −0, a green merge check.
function W5() {
  return (
    <Frame>
      <path
        d="M 32 34 v 26 m 0 12 a 5 5 0 1 0 0.001 0 M 32 34 a 5 5 0 1 0 -0.001 0 m 34 10 a 5 5 0 1 0 -0.001 0 m 0 6 v 8 a 12 12 0 0 1 -12 12 h -10"
        stroke="var(--muted-foreground)"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      <rect x="92" y="34" width="96" height="7" rx="3.5" fill="var(--foreground)" opacity="0.7" />
      <rect x="92" y="49" width="60" height="5" rx="2.5" fill="var(--muted)" />
      <text x="92" y="76" fontSize="11" fontWeight="700" fill="#22c55e">+2</text>
      <text x="112" y="76" fontSize="11" fontWeight="700" fill="var(--muted-foreground)" opacity="0.6">−0</text>
      <rect x="150" y="64" width="66" height="18" rx="9" fill="#22c55e" opacity="0.12" />
      <path d="M 160 73 l 3.5 3.5 l 6 -7" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <text x="174" y="77" fontSize="9" fontWeight="600" fill="#22c55e">merged</text>
    </Frame>
  );
}

// ─── Step 3: See everything ───────────────────────────────────────────────────

// 3A — refined dashboard: stat tiles + gradient area chart.
function S1() {
  return (
    <Frame>
      <rect x="22" y="22" width="62" height="24" rx="7" fill="var(--muted)" opacity="0.4" />
      <rect x="90" y="22" width="62" height="24" rx="7" fill="var(--muted)" opacity="0.4" />
      <rect x="158" y="22" width="62" height="24" rx="7" fill="var(--muted)" opacity="0.4" />
      <rect x="29" y="29" width="24" height="3.5" rx="1.75" fill="var(--muted-foreground)" opacity="0.6" />
      <rect x="97" y="29" width="28" height="3.5" rx="1.75" fill="var(--muted-foreground)" opacity="0.6" />
      <rect x="165" y="29" width="20" height="3.5" rx="1.75" fill="var(--muted-foreground)" opacity="0.6" />
      <rect x="29" y="37" width="16" height="4" rx="2" fill="#f97316" opacity="0.85" />
      <rect x="97" y="37" width="20" height="4" rx="2" fill="#3b82f6" opacity="0.85" />
      <rect x="165" y="37" width="14" height="4" rx="2" fill="#22c55e" opacity="0.85" />
      <defs>
        <linearGradient id="s1g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f97316" stopOpacity="0.25" />
          <stop offset="1" stopColor="#f97316" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M 22 88 C 45 84 55 74 75 78 S 110 66 130 70 S 175 56 198 60 L 220 56 L 220 92 L 22 92 Z"
        fill="url(#s1g)"
      />
      <path
        d="M 22 88 C 45 84 55 74 75 78 S 110 66 130 70 S 175 56 198 60 L 220 56"
        fill="none"
        stroke="#f97316"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="220" cy="56" r="3.5" fill="#f97316" stroke="var(--background)" strokeWidth="1.5" />
    </Frame>
  );
}

// 3B — trace waterfall: staggered colored spans, like the real trace view.
function S2() {
  return (
    <Frame>
      <rect x="22" y="26" width="34" height="4" rx="2" fill="var(--muted-foreground)" opacity="0.5" />
      <rect x="64" y="24" width="74" height="8" rx="4" fill="#f97316" opacity="0.8" />
      <rect x="22" y="44" width="28" height="4" rx="2" fill="var(--muted-foreground)" opacity="0.5" />
      <rect x="96" y="42" width="44" height="8" rx="4" fill="#8b5cf6" opacity="0.8" />
      <rect x="22" y="62" width="40" height="4" rx="2" fill="var(--muted-foreground)" opacity="0.5" />
      <rect x="118" y="60" width="84" height="8" rx="4" fill="#3b82f6" opacity="0.8" />
      <rect x="22" y="80" width="24" height="4" rx="2" fill="var(--muted-foreground)" opacity="0.5" />
      <rect x="182" y="78" width="30" height="8" rx="4" fill="#22c55e" opacity="0.8" />
      <line x1="64" y1="20" x2="64" y2="92" stroke="var(--border)" strokeDasharray="2 4" />
    </Frame>
  );
}

// 3C — the number: a big live cost, sparkline under it, eval pill.
function S3() {
  return (
    <Frame>
      <text
        x="24"
        y="56"
        fontSize="26"
        fontWeight="700"
        fill="var(--foreground)"
        fontFamily="var(--font-host-grotesk, inherit)"
      >
        $0.0041
      </text>
      <rect x="24" y="66" width="52" height="4" rx="2" fill="var(--muted)" />
      <rect x="164" y="26" width="52" height="18" rx="9" fill="#22c55e" opacity="0.12" />
      <text x="174" y="38.5" fontSize="9.5" fontWeight="600" fill="#22c55e">94%</text>
      <path
        d="M 24 86 L 52 82 L 78 84 L 106 74 L 134 78 L 162 66 L 190 70 L 216 62"
        fill="none"
        stroke="#f97316"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.9"
      />
      <circle cx="216" cy="62" r="3" fill="#f97316" />
    </Frame>
  );
}

// 3D — chart with tooltip: smooth glowing line, hovered point, value chip.
function S4() {
  return (
    <Frame>
      <line x1="22" y1="88" x2="220" y2="88" stroke="var(--border)" />
      <path
        d="M 22 80 C 50 76 62 62 88 66 S 130 50 156 54 S 196 40 220 44"
        fill="none"
        stroke="#f97316"
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.15"
      />
      <path
        d="M 22 80 C 50 76 62 62 88 66 S 130 50 156 54 S 196 40 220 44"
        fill="none"
        stroke="#f97316"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line x1="156" y1="30" x2="156" y2="88" stroke="var(--muted-foreground)" strokeOpacity="0.3" strokeDasharray="3 3" />
      <circle cx="156" cy="54" r="4" fill="#f97316" stroke="var(--background)" strokeWidth="2" />
      <rect x="130" y="18" width="52" height="20" rx="10" fill="var(--foreground)" />
      <text x="156" y="31.5" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="var(--background)">
        $0.0041
      </text>
    </Frame>
  );
}

// 3E — everything at once: 2x2 stat grid, one with a pass-rate meter.
function S5() {
  return (
    <Frame>
      <g>
        <rect x="24" y="26" width="30" height="4" rx="2" fill="var(--muted-foreground)" opacity="0.5" />
        <text x="24" y="50" fontSize="14" fontWeight="700" fill="var(--foreground)">$842</text>
      </g>
      <g>
        <rect x="130" y="26" width="26" height="4" rx="2" fill="var(--muted-foreground)" opacity="0.5" />
        <text x="130" y="50" fontSize="14" fontWeight="700" fill="var(--foreground)">2.3s</text>
      </g>
      <g>
        <rect x="24" y="64" width="26" height="4" rx="2" fill="var(--muted-foreground)" opacity="0.5" />
        <text x="24" y="88" fontSize="14" fontWeight="700" fill="var(--foreground)">42.8M</text>
      </g>
      <g>
        <rect x="130" y="64" width="22" height="4" rx="2" fill="var(--muted-foreground)" opacity="0.5" />
        <text x="130" y="88" fontSize="14" fontWeight="700" fill="#22c55e">94%</text>
        <rect x="168" y="80" width="48" height="6" rx="3" fill="var(--muted)" />
        <rect x="168" y="80" width="45" height="6" rx="3" fill="#22c55e" opacity="0.8" />
      </g>
      <line x1="120" y1="26" x2="120" y2="88" stroke="var(--border)" />
      <line x1="24" y1="57" x2="216" y2="57" stroke="var(--border)" />
    </Frame>
  );
}

// ─── The bake-off section ─────────────────────────────────────────────────────

const ROWS = [
  { name: "A", arts: [P1, W1, S1] },
  { name: "B", arts: [P2, W2, S2] },
  { name: "C", arts: [P3, W3, S3] },
  { name: "D", arts: [P4, W4, S4] },
  { name: "E", arts: [P5, W5, S5] },
] as const;

const TITLES = ["1. Copy the prompt", "2. Your agent sets it up", "3. See everything"];

export function HowItWorksVariants() {
  return (
    <section className="mx-auto w-full max-w-7xl px-5 sm:px-8">
      <p className="mb-10 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Illustration bake-off (temp): pick one per step, mixing rows is fine
      </p>
      <div className="flex flex-col gap-14">
        {ROWS.map((row) => (
          <div key={row.name}>
            <p className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Variation {row.name}
            </p>
            <div className="grid gap-12 md:grid-cols-3 md:gap-8">
              {row.arts.map((Art, i) => (
                <div key={TITLES[i]}>
                  <Art />
                  <p className="mt-3 text-sm text-muted-foreground">
                    {TITLES[i]} <span className="text-muted-foreground/50">({row.name})</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
