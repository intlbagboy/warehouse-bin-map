import { normalizeBrand } from "./brandAliases";

// Turns Google Sheets Transfer Log rows into day-by-day put-away history.
// Each row already represents a real event — a specific qty of a SKU moved
// to a specific bin, on a specific date — so unlike the NetSuite archive
// comparison, no before/after diffing is needed here.
//
// Row shape (see lib/sheetData.js): [date, lp, sku, desc, qty, uom, loc, by,
// verified, notes, brand]
export function getSheetPutAways(logRows) {
  const byDate = new Map();
  for (const row of logRows) {
    const [date, lp, sku, desc, qty, , loc, , verified, notes, brand] = row;
    if (!date || !loc) continue;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push({
      sku: sku || "",
      bin: loc,
      description: desc || "",
      brand: normalizeBrand(brand),
      licensePlate: lp || "",
      delta: Number(qty) || 0,
      matched: true, // every logged transfer represents a real placement into a bin
      verified: verified === "Y",
      notes: notes || "",
    });
  }

  const days = [];
  for (const [date, changes] of byDate.entries()) {
    const putAway = changes.reduce((s, c) => s + c.delta, 0);
    changes.sort((a, b) => b.delta - a.delta);
    days.push({ date, putAway, changes });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  return days;
}
