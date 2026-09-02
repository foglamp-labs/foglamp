import { diffLines, sequenceSimilarity } from "./diff";

// Prompt version inference. Input: one row per distinct normalized prompt an
// agent has run with (its hash, text, when it was first/last seen, run count).
// Output: versions — groups of hashes that share a template, ordered by first
// appearance. Nothing here is declared by the user; versions are read off the
// runs.
//
// Two kinds of variation show up between an agent's prompts:
//   • slots — dynamic content the normalizer didn't catch (a user's name, a
//     retrieved snippet). Values interleave in time and differ from each other.
//   • edits — someone changed the prompt. The new text replaces the old one
//     cleanly in time and every later run carries it.
// A prompt joins the current version when it only differs at positions that
// already vary within it, or when it overlaps the version in time. Otherwise it
// is held as a cut candidate until enough runs share the same new text.

export type PromptSample = {
  hash: string;
  /** Normalized prompt text (see normalizePrompt). */
  text: string;
  firstSeen: Date;
  lastSeen: Date;
  runs: number;
};

export type InferredVersion = {
  /** Canonical prompt with varying stretches replaced by a `{…}` line. */
  template: string;
  /** Member hashes, oldest first. */
  hashes: string[];
  /** Number of varying stretches in the template. */
  slotCount: number;
  runs: number;
  firstSeen: Date;
  lastSeen: Date;
};

export type InferOptions = {
  /** Runs a new prompt text needs before it counts as a new version. */
  minRuns?: number;
  /** Overlap tolerated between an old and a new version (rolling deploys). */
  graceMs?: number;
  /** Text similarity below which prompts are unrelated (separate families). */
  similarity?: number;
};

const DEFAULTS: Required<InferOptions> = {
  minRuns: 3,
  graceMs: 5 * 60 * 1000,
  similarity: 0.6,
};

/** The template line standing in for content that varies between runs. */
export const SLOT_LINE = "{…}";

// A member's text expressed in the coordinates of its family's canonical
// prompt: a map from hunk anchor → hunk content. Keys are `rep:<i>` (replaces
// canonical lines starting at i) and `ins:<i>` (inserted before canonical line
// i). A member identical to the canonical has an empty map; "=" below stands
// for "same as canonical" at a position.
type Aligned = Map<string, string>;
const SAME = "=";

type Member = PromptSample & { lines: string[]; aligned: Aligned };

type Family = { canonical: Member; members: Member[] };

export function inferVersions(
  samples: PromptSample[],
  options: InferOptions = {},
): InferredVersion[] {
  const opts = { ...DEFAULTS, ...options };
  const versions: InferredVersion[] = [];
  for (const family of clusterFamilies(samples, opts.similarity)) {
    for (const group of splitFamily(family, opts)) versions.push(render(family, group));
  }
  versions.sort((a, b) => a.firstSeen.getTime() - b.firstSeen.getTime());
  return versions;
}

// --- families ---------------------------------------------------------------

function clusterFamilies(samples: PromptSample[], threshold: number): Family[] {
  // Most-run first so each family's canonical is its most representative text.
  const ordered = [...samples].sort((a, b) => b.runs - a.runs);
  const families: { canonical: PromptSample; lines: string[]; members: PromptSample[] }[] = [];
  for (const s of ordered) {
    const lines = s.text.split("\n");
    let best: (typeof families)[number] | undefined;
    let bestScore = 0;
    for (const f of families) {
      const score = sequenceSimilarity(f.lines, lines);
      if (score > bestScore) {
        bestScore = score;
        best = f;
      }
    }
    if (best && bestScore >= threshold) best.members.push(s);
    else families.push({ canonical: s, lines, members: [s] });
  }
  return families.map((f) => {
    const members = f.members.map((s) => {
      const lines = s.text.split("\n");
      return { ...s, lines, aligned: align(f.lines, lines) };
    });
    const canonical = members.find((m) => m.hash === f.canonical.hash) as Member;
    return { canonical, members };
  });
}

// --- alignment --------------------------------------------------------------

function align(canonical: string[], lines: string[]): Aligned {
  const ops = diffLines(canonical, lines);
  const out: Aligned = new Map();
  let i = 0; // index into canonical
  let k = 0;
  while (k < ops.length) {
    const op = ops[k] as (typeof ops)[number];
    if (op.type === "same") {
      i++;
      k++;
      continue;
    }
    // A hunk: a maximal run of del/add ops. Anchor at the first deleted
    // canonical line, or as an insertion before the next canonical line.
    const anchor = i;
    let deleted = 0;
    const added: string[] = [];
    while (k < ops.length && (ops[k] as (typeof ops)[number]).type !== "same") {
      const h = ops[k] as (typeof ops)[number];
      if (h.type === "del") deleted++;
      else added.push(h.line);
      k++;
    }
    i += deleted;
    const key = deleted > 0 ? `rep:${anchor}` : `ins:${anchor}`;
    out.set(key, `${deleted}\n${added.join("\n")}`);
  }
  return out;
}

function valueAt(m: Member, key: string): string {
  return m.aligned.get(key) ?? SAME;
}

// --- splitting a family into versions ---------------------------------------

class Group {
  members: Member[] = [];
  /** Distinct values seen at each position across the group. */
  values = new Map<string, Set<string>>();
  lastSeen = 0;

  add(m: Member) {
    this.members.push(m);
    this.lastSeen = Math.max(this.lastSeen, m.lastSeen.getTime());
    // Positions this member touches, plus positions the group already tracks
    // (where this member is "=" if it has no entry).
    for (const key of m.aligned.keys()) this.note(key, valueAt(m, key));
    for (const key of this.values.keys()) this.note(key, valueAt(m, key));
  }

  private note(key: string, value: string) {
    let set = this.values.get(key);
    if (!set) {
      set = new Set<string>();
      // Earlier members had no entry here → they were all "=".
      if (this.members.length > 1) set.add(SAME);
      this.values.set(key, set);
    }
    set.add(value);
  }

  /** Positions where the group is unanimous but `m` carries something else. */
  disagreements(m: Member): string[] {
    const out: string[] = [];
    const keys = new Set<string>([...this.values.keys(), ...m.aligned.keys()]);
    for (const key of keys) {
      const set = this.values.get(key);
      const unanimous = set === undefined ? SAME : set.size === 1 ? [...set][0] : undefined;
      if (unanimous === undefined) continue;
      if (valueAt(m, key) !== unanimous) out.push(key);
    }
    return out;
  }
}

function splitFamily(family: Family, opts: Required<InferOptions>): Member[][] {
  const members = [...family.members].sort(
    (a, b) => a.firstSeen.getTime() - b.firstSeen.getTime() || b.runs - a.runs,
  );
  const groups: Member[][] = [];
  let current = new Group();
  // Clean-cut candidates that don't have enough runs yet to open a version.
  let pending: { member: Member; diffs: string[] }[] = [];

  for (const m of members) {
    if (current.members.length === 0) {
      current.add(m);
      continue;
    }
    const diffs = current.disagreements(m);
    // Fits the template (only differs where the version already varies), or
    // overlaps the version in time → dynamic content, same version.
    if (diffs.length === 0 || current.lastSeen > m.firstSeen.getTime() + opts.graceMs) {
      current.add(m);
      continue;
    }
    pending.push({ member: m, diffs });
    // Pending prompts that share one of this prompt's new values are the same
    // edit (a templated prompt's new version shows up as several hashes).
    const shared = pending.filter(
      (p) => p.member === m || diffs.some((k) => valueAt(p.member, k) === valueAt(m, k)),
    );
    const runs = shared.reduce((n, p) => n + p.member.runs, 0);
    // A lone new text among many unrelated pending ones is a slot value that
    // happened to recur, not an edit — unless it is the only candidate.
    const established = runs >= opts.minRuns && (shared.length >= 2 || pending.length === 1);
    if (!established) continue;

    const sharedSet = new Set(shared.map((p) => p.member));
    for (const p of pending) if (!sharedSet.has(p.member)) current.add(p.member);
    groups.push(current.members);
    current = new Group();
    for (const p of shared) current.add(p.member);
    pending = [];
  }
  for (const p of pending) current.add(p.member);
  if (current.members.length > 0) groups.push(current.members);
  return groups;
}

// --- rendering --------------------------------------------------------------

function render(family: Family, members: Member[]): InferredVersion {
  const canonical = members.reduce((best, m) => (m.runs > best.runs ? m : best), members[0] as Member);
  // Re-align against this version's own canonical so the template reads as
  // the most-run prompt with only this version's variation blanked out.
  const aligned =
    canonical === family.canonical
      ? members.map((m) => m.aligned)
      : members.map((m) => align(canonical.lines, m.lines));
  const values = new Map<string, Set<string>>();
  for (const a of aligned) {
    for (const [key, value] of a) {
      let set = values.get(key);
      if (!set) {
        set = new Set([SAME]);
        values.set(key, set);
      }
      set.add(value);
    }
  }
  // Varying positions: replaced canonical lines and insertion points.
  const replaced = new Set<number>();
  const inserts = new Set<number>();
  for (const [key, set] of values) {
    if (set.size < 2) continue;
    const idx = Number(key.slice(4));
    if (key.startsWith("rep:")) {
      let span = 1;
      for (const v of set) if (v !== SAME) span = Math.max(span, Number(v.split("\n", 1)[0]) || 1);
      for (let i = idx; i < idx + span; i++) replaced.add(i);
    } else inserts.add(idx);
  }
  const out: string[] = [];
  let slotCount = 0;
  const pushSlot = () => {
    if (out[out.length - 1] !== SLOT_LINE) {
      out.push(SLOT_LINE);
      slotCount++;
    }
  };
  for (let i = 0; i <= canonical.lines.length; i++) {
    if (inserts.has(i)) pushSlot();
    if (i === canonical.lines.length) break;
    if (replaced.has(i)) pushSlot();
    else out.push(canonical.lines[i] as string);
  }

  const ordered = [...members].sort((a, b) => a.firstSeen.getTime() - b.firstSeen.getTime());
  return {
    template: out.join("\n"),
    hashes: ordered.map((m) => m.hash),
    slotCount,
    runs: members.reduce((n, m) => n + m.runs, 0),
    firstSeen: new Date(Math.min(...members.map((m) => m.firstSeen.getTime()))),
    lastSeen: new Date(Math.max(...members.map((m) => m.lastSeen.getTime()))),
  };
}
