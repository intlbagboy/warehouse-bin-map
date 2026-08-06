import fs from "fs";
import path from "path";
import { parseNetsuiteCsv } from "./netsuiteParse";
import { normalizeBrand } from "./brandAliases";

const HISTORY_DIR = path.join(process.cwd(), "data", "history");
const FILENAME_RE = /^(\d{4}-\d{2}-\d{2})\.csv$/;

function listHistoryFiles() {
  try {
    return fs
      .readdirSync(HISTORY_DIR)
      .filter((f) => FILENAME_RE.test(f))
      .sort(); // filenames are YYYY-MM-DD, so lexical sort is chronological
  } catch {
    // Directory doesn't exist yet — no archives captured. Not an error,
    // Zapier just hasn't written anything (or hasn't been set up) yet.
    return [];
  }
}

// Reads every archived daily CSV and returns:
//   - days: one summary per archived day (on-rack/queue/total/pct)
//   - deltas: for each day after the first, what changed since the previous
//     day, keyed by exact SKU+bin. A positive change landing on a matched
//     (real rack) bin counts as "put away" that day. Moving a SKU from a
//     staging bin to a rack bin shows up as two linked changes — a decrease
//     at the old (unmatched) bin and an increase at the new (matched) one —
//     which is exactly the put-away event this is meant to capture.
export function getHistory(validCodes) {
  const files = listHistoryFiles();
  const days = [];

  for (const file of files) {
    const date = FILENAME_RE.exec(file)[1];
    let text;
    try {
      text = fs.readFileSync(path.join(HISTORY_DIR, file), "utf-8");
    } catch {
      continue;
    }
    const { entries } = parseNetsuiteCsv(text, validCodes, normalizeBrand);
    const onRack = entries.filter((e) => e.matched).reduce((s, e) => s + e.qty, 0);
    const queue = entries.filter((e) => !e.matched).reduce((s, e) => s + e.qty, 0);
    const total = onRack + queue;
    days.push({ date, onRack, queue, total, pct: total > 0 ? onRack / total : 0, entries });
  }

  const deltas = [];
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1];
    const curr = days[i];

    const prevByKey = new Map();
    for (const e of prev.entries) prevByKey.set(`${e.sku}::${e.bin}`, e);
    const currByKey = new Map();
    for (const e of curr.entries) currByKey.set(`${e.sku}::${e.bin}`, e);

    const allKeys = new Set([...prevByKey.keys(), ...currByKey.keys()]);
    const changes = [];
    for (const key of allKeys) {
      const before = prevByKey.get(key);
      const after = currByKey.get(key);
      const beforeQty = before ? before.qty : 0;
      const afterQty = after ? after.qty : 0;
      if (beforeQty === afterQty) continue;
      const ref = after || before;
      const [sku, bin] = key.split("::");
      changes.push({
        sku,
        bin,
        description: ref.description,
        brand: ref.brand,
        matched: ref.matched,
        before: beforeQty,
        after: afterQty,
        delta: afterQty - beforeQty,
      });
    }

    const putAway = changes.filter((c) => c.delta > 0 && c.matched).reduce((s, c) => s + c.delta, 0);
    changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    deltas.push({ date: curr.date, putAway, changes });
  }

  // Strip the (potentially large) raw entries list out of what gets sent to
  // the client — only "days" needs entries for computing deltas server-side,
  // the browser just needs the summaries plus the already-computed deltas.
  const daySummaries = days.map(({ date, onRack, queue, total, pct }) => ({ date, onRack, queue, total, pct }));

  return { days: daySummaries, deltas };
}
