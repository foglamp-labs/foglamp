import { diffLines } from "./diff";
import { SLOT_LINE } from "./infer";

// Reads a member prompt back through its version's template: for each slot
// line in the template, the text this prompt carries at that position. Lets
// the dashboard show what "varies per run" actually looks like.

/**
 * The value each template slot takes in `text`, in template order. A slot is
 * `null` when the alignment can't attribute text to it (two slots collapsed
 * into one changed region, or the prompt has a literal slot line).
 */
export function slotValues(template: string, text: string): (string | null)[] {
  const templateLines = template.split("\n");
  const slotCount = templateLines.filter((l) => l === SLOT_LINE).length;
  const out: (string | null)[] = new Array(slotCount).fill(null);
  if (slotCount === 0) return out;

  const ops = diffLines(templateLines, text.split("\n"));
  let slot = 0; // slots passed so far, in template order
  let k = 0;
  while (k < ops.length) {
    const op = ops[k] as (typeof ops)[number];
    if (op.type === "same") {
      // A literal slot line in the prompt matched the template's — unknowable.
      if (op.line === SLOT_LINE) slot++;
      k++;
      continue;
    }
    // A hunk: a maximal run of del/add ops. Its added lines are a slot's
    // value only when the hunk deletes exactly that one slot line — if other
    // template lines went too, the added text can't be split between them.
    const first = slot;
    let deleted = 0;
    const added: string[] = [];
    while (k < ops.length && (ops[k] as (typeof ops)[number]).type !== "same") {
      const h = ops[k] as (typeof ops)[number];
      if (h.type === "del") {
        deleted++;
        if (h.line === SLOT_LINE) slot++;
      } else added.push(h.line);
      k++;
    }
    if (slot - first === 1 && deleted === 1) out[first] = added.join("\n");
  }
  return out;
}
