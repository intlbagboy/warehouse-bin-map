import { parseCSV } from "./aisleLayout";

// Column order isn't guaranteed to stay identical between a manual saved-search
// export and the automated emailed one, so columns are located by header name
// (case-insensitive) rather than fixed position.
const COLUMN_ALIASES = {
  name: ["name"],
  displayName: ["display name"],
  binNumber: ["bin number"],
  onHand: ["on hand"],
  brandClass: ["class (no hierarchy)", "class"],
};

function buildColumnIndex(headerRow) {
  const lower = headerRow.map((h) => (h || "").toString().trim().toLowerCase());
  const index = {};
  for (const [key, candidates] of Object.entries(COLUMN_ALIASES)) {
    index[key] = candidates.map((c) => lower.indexOf(c)).find((i) => i !== -1);
    if (index[key] === undefined) index[key] = -1;
  }
  return index;
}

// Parses raw NetSuite export CSV text into simple flat rows: one per
// SKU+bin line. `validCodes` is the set of real Aisle-Spot-Level codes, used
// to mark each row matched (on a rack) or not (staging/putaway queue).
// `normalizeBrandFn` is passed in rather than imported directly, so this
// module has no dependency beyond CSV parsing itself.
export function parseNetsuiteCsv(text, validCodes, normalizeBrandFn) {
  const allRows = parseCSV(text);
  if (allRows.length === 0) return { columnIndex: {}, entries: [] };
  const columnIndex = buildColumnIndex(allRows[0]);
  const entries = [];
  for (const row of allRows.slice(1)) {
    const name = row[columnIndex.name];
    if (!name) continue;
    const displayName = columnIndex.displayName !== -1 ? row[columnIndex.displayName] : "";
    const binNumber = columnIndex.binNumber !== -1 ? row[columnIndex.binNumber] : "";
    const onHand = columnIndex.onHand !== -1 ? row[columnIndex.onHand] : 0;
    const rawBrand = columnIndex.brandClass !== -1 ? row[columnIndex.brandClass] : "";

    const qty = Number(onHand) || 0;
    const brand = normalizeBrandFn ? normalizeBrandFn(rawBrand) : (rawBrand || "").toString();
    const bin = (binNumber || "").toString().trim();
    const sku = (name || "").toString();
    const matched = !!bin && validCodes.has(bin);

    entries.push({ sku, description: (displayName || "").toString(), qty, brand, bin, matched });
  }
  return { columnIndex, entries };
}
