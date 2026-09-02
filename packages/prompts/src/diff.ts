// Line diff (LCS). Used by version inference to align a prompt against the
// canonical prompt of its family, and by the dashboard to show a version's
// template against the previous one. Prompts are small (hundreds of lines), so
// a plain O(n·m) table is fine; oversized inputs fall back to prefix/suffix
// trimming with the middle reported as one replacement.

export type DiffOp = { type: "same" | "add" | "del"; line: string };

const MAX_CELLS = 4_000_000;

export function lineDiff(a: string, b: string): DiffOp[] {
  return diffLines(a.split("\n"), b.split("\n"));
}

export function diffLines(a: string[], b: string[]): DiffOp[] {
  // Trim the common prefix/suffix first — most prompt variants differ in a few
  // lines, so this keeps the table tiny.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const ops: DiffOp[] = [];
  for (let i = 0; i < start; i++) ops.push({ type: "same", line: a[i] as string });

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if (midA.length * midB.length > MAX_CELLS) {
    for (const line of midA) ops.push({ type: "del", line });
    for (const line of midB) ops.push({ type: "add", line });
  } else {
    ops.push(...lcsDiff(midA, midB));
  }

  for (let i = endA; i < a.length; i++) ops.push({ type: "same", line: a[i] as string });
  return ops;
}

function lcsDiff(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;
  if (n === 0) return b.map((line) => ({ type: "add" as const, line }));
  if (m === 0) return a.map((line) => ({ type: "del" as const, line }));
  // dp[i][j] = LCS length of a[i..] and b[j..]
  const width = m + 1;
  const dp = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] =
        a[i] === b[j]
          ? (dp[(i + 1) * width + j + 1] as number) + 1
          : Math.max(dp[(i + 1) * width + j] as number, dp[i * width + j + 1] as number);
    }
  }
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "same", line: a[i] as string });
      i++;
      j++;
    } else if ((dp[(i + 1) * width + j] as number) >= (dp[i * width + j + 1] as number)) {
      ops.push({ type: "del", line: a[i] as string });
      i++;
    } else {
      ops.push({ type: "add", line: b[j] as string });
      j++;
    }
  }
  while (i < n) ops.push({ type: "del", line: a[i++] as string });
  while (j < m) ops.push({ type: "add", line: b[j++] as string });
  return ops;
}

/**
 * How alike two prompts are, 0..1: shared lines count fully, and replaced
 * lines count by how many words they keep (so a prompt whose only change is a
 * name inside one line still scores high). Symmetric, order-aware.
 */
export function sequenceSimilarity(a: string[], b: string[]): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  const ops = diffLines(a, b);
  let credit = 0;
  let k = 0;
  while (k < ops.length) {
    const op = ops[k] as DiffOp;
    if (op.type === "same") {
      credit += 1;
      k++;
      continue;
    }
    const del: string[] = [];
    const add: string[] = [];
    while (k < ops.length && (ops[k] as DiffOp).type !== "same") {
      const h = ops[k] as DiffOp;
      (h.type === "del" ? del : add).push(h.line);
      k++;
    }
    if (del.length > 0 && add.length > 0) {
      credit += wordSimilarity(del.join(" "), add.join(" ")) * ((del.length + add.length) / 2);
    }
  }
  return Math.min(1, credit / longest);
}

const MAX_WORDS = 400;

function wordSimilarity(a: string, b: string): number {
  const wa = a.split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
  const wb = b.split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
  const longest = Math.max(wa.length, wb.length);
  if (longest === 0) return 1;
  const same = diffLines(wa, wb).filter((op) => op.type === "same").length;
  return same / longest;
}
