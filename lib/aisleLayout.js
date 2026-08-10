const SHEET_ID = process.env.GOOGLE_SHEET_ID || "1GVfWUVK0VbPUGXIEMqqHdYoDsyrg27d6";

export const DEFAULT_SPOTS_PER_AISLE = 22;
export const LEVELS_PER_AISLE = 4;

function csvUrl(tabName) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
    tabName
  )}`;
}

// Minimal CSV parser that handles quoted fields (commas/quotes inside quotes).
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += c;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell !== ""));
}

export async function fetchSheetTab(tabName) {
  const res = await fetch(csvUrl(tabName), { next: { revalidate: 60 } });
  if (!res.ok) {
    throw new Error(
      `Couldn't fetch the "${tabName}" tab (status ${res.status}). Make sure the Google Sheet is shared as "Anyone with the link – Viewer".`
    );
  }
  const text = await res.text();
  const rows = parseCSV(text);
  return rows.slice(1); // drop header row
}

// Falls back to a naming convention (aisles with "C" in the code have 20 spots,
// not 22) when the optional Spots column in Aisle List is blank or invalid —
// but an explicit value in that column always wins.
function resolveSpotCount(code, rawValue) {
  const parsed = parseInt(rawValue, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return code.toUpperCase().includes("C") ? 20 : DEFAULT_SPOTS_PER_AISLE;
}

// Aisles that are bulk storage — a flat run of numbered spaces along a wall
// with no rack levels — rather than real Aisle-Spot-Level racking. Hardcoded
// rather than sheet-driven since these are rare, physically distinct
// exceptions to the normal layout (see BinMap.js for the flat-row rendering
// and netsuiteData.js for the bin-number matching this implies).
export const BULK_AISLE_CODES = new Set(["W"]);
const BULK_AISLE_SPOTS = 44;

// The physical warehouse layout — which aisles exist, how many spots each has,
// which way they're oriented, and which spots are blocked by beams. This is a
// property of the building, not of which inventory system (Google Sheets vs
// NetSuite) you're viewing, so both data sources share this.
export async function getAisleLayout() {
  const [aisleRows, blockedRows] = await Promise.all([
    fetchSheetTab("Aisle List"),
    fetchSheetTab("Spots Blocked by Beams"),
  ]);

  const aisleCodes = aisleRows.map((r) => r[0]).filter(Boolean);
  const aisleFlipped = {};
  const aisleSpots = {};
  for (const row of aisleRows) {
    const code = row[0];
    if (!code) continue;
    const orientation = (row[1] || "").trim().toLowerCase();
    aisleFlipped[code] = orientation === "flipped";
    aisleSpots[code] = resolveSpotCount(code, row[2]);
  }

  const blockedSpots = new Set(blockedRows.map((r) => r[0]).filter(Boolean));

  const aisles = aisleCodes.map((code) => {
    const bulk = BULK_AISLE_CODES.has(code);
    return {
      code,
      spots: bulk ? BULK_AISLE_SPOTS : aisleSpots[code] || DEFAULT_SPOTS_PER_AISLE,
      levels: bulk ? 1 : LEVELS_PER_AISLE,
      flipped: !!aisleFlipped[code],
      bulk,
    };
  });

  return { aisleCodes, aisles, blockedSpots };
}

// A curated, distinguishable palette. Brands are assigned colors in alphabetical
// order so the mapping stays stable across reloads regardless of fetch order.
// 20 colors chosen for pairwise contrast (not just evenly-spaced hues) so
// adjacent assignments don't read as "the same color" at a glance.
const BRAND_PALETTE = [
  "#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed",
  "#0891b2", "#db2777", "#65a30d", "#ea580c", "#4f46e5",
  "#0d9488", "#be123c", "#4d7c0f", "#9333ea", "#0369a1",
  "#b45309", "#15803d", "#c026d3", "#1e40af", "#a16207",
];

// Once every color in the palette is used once, a second (and third) brand
// can land on the same color — so beyond that point we also vary the line
// style, giving color+pattern combinations rather than repeating colors
// with no way to tell them apart.
const PATTERN_CYCLE = ["solid", "dashed", "dotted"];

export function buildBrandColors(brands) {
  const unique = [...new Set(brands.filter(Boolean))].sort();
  const map = {};
  unique.forEach((b, i) => {
    map[b] = {
      color: BRAND_PALETTE[i % BRAND_PALETTE.length],
      pattern: PATTERN_CYCLE[Math.floor(i / BRAND_PALETTE.length) % PATTERN_CYCLE.length],
    };
  });
  return map;
}
