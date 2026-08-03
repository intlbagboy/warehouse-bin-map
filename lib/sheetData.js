const SHEET_ID = process.env.GOOGLE_SHEET_ID || "1GVfWUVK0VbPUGXIEMqqHdYoDsyrg27d6";

const DEFAULT_SPOTS_PER_AISLE = 22;
const LEVELS_PER_AISLE = 4;

// Falls back to a naming convention (aisles with "C" in the code have 20 spots,
// not 22) when the optional Spots column in Aisle List is blank or invalid —
// but an explicit value in that column always wins.
function resolveSpotCount(code, rawValue) {
  const parsed = parseInt(rawValue, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return code.toUpperCase().includes("C") ? 20 : DEFAULT_SPOTS_PER_AISLE;
}

function csvUrl(tabName) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
    tabName
  )}`;
}

// Minimal CSV parser that handles quoted fields (commas/quotes inside quotes).
function parseCSV(text) {
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

// A curated, distinguishable palette. Brands are assigned colors in alphabetical
// order so the mapping stays stable across reloads regardless of fetch order.
const BRAND_PALETTE = [
  "#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed",
  "#0891b2", "#db2777", "#65a30d", "#ea580c", "#4f46e5",
];

function buildBrandColors(brands) {
  const unique = [...new Set(brands.filter(Boolean))].sort();
  const map = {};
  unique.forEach((b, i) => {
    map[b] = BRAND_PALETTE[i % BRAND_PALETTE.length];
  });
  return map;
}

async function fetchTab(tabName) {
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

export async function getWarehouseData() {
  const [aisleRows, blockedRows, logRows] = await Promise.all([
    fetchTab("Aisle List"),
    fetchTab("Spots Blocked by Beams"),
    fetchTab("Transfer Log"),
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

  // location code -> list of transfer entries
  const entriesByLoc = {};
  for (const row of logRows) {
    const [, lp, sku, desc, qty, uom, loc, by, verified, notes, brand] = row;
    if (!lp || !loc) continue;
    if (!entriesByLoc[loc]) entriesByLoc[loc] = [];
    entriesByLoc[loc].push({
      licensePlate: lp,
      sku,
      description: desc,
      qty: Number(qty) || 0,
      uom,
      transferredBy: by,
      verified: verified === "Y",
      notes: notes || "",
      brand: brand || "",
    });
  }

  const brandColors = buildBrandColors(logRows.map((r) => r[10]));

  const locations = {};
  const actionItems = [];

  for (const aisle of aisleCodes) {
    const spotsThisAisle = aisleSpots[aisle] || DEFAULT_SPOTS_PER_AISLE;
    for (let spot = 1; spot <= spotsThisAisle; spot++) {
      const spotKey = `${aisle}-${spot}`;
      const isBlocked = blockedSpots.has(spotKey);
      for (let level = 1; level <= LEVELS_PER_AISLE; level++) {
        const code = `${aisle}-${String(spot).padStart(2, "0")}-${level}`;
        if (isBlocked) {
          locations[code] = { status: "blocked", entries: [], qty: 0, brand: "" };
          continue;
        }
        const entries = entriesByLoc[code] || [];
        if (entries.length === 0) {
          locations[code] = { status: "empty", entries: [], qty: 0, brand: "" };
          continue;
        }
        const needsReview = entries.some((e) => !e.verified);
        const qty = entries.reduce((sum, e) => sum + (e.qty || 0), 0);
        // primary brand shown on the cell = first entry's brand
        const brand = entries[0].brand || "";
        locations[code] = {
          status: needsReview ? "review" : "occupied",
          entries,
          qty,
          brand,
        };

        if (needsReview) {
          for (const e of entries.filter((e) => !e.verified)) {
            actionItems.push({
              location: code,
              licensePlate: e.licensePlate,
              sku: e.sku,
              description: e.description,
              qty: e.qty,
              brand: e.brand,
              notes: e.notes,
            });
          }
        }
      }
    }
  }

  // Detect other bin codes mentioned inside action-item notes (e.g. "Currently
  // sitting in 4A-21-1, will be moved..."), so that destination bin can be
  // flagged on the map even though nothing's been logged to it yet.
  const escapedAisles = aisleCodes.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const locationCodeRegex =
    escapedAisles.length > 0 ? new RegExp(`\\b(?:${escapedAisles.join("|")})-\\d{2}-\\d\\b`, "g") : null;

  const referencedBins = {};
  if (locationCodeRegex) {
    for (const item of actionItems) {
      if (!item.notes) continue;
      const found = item.notes.match(locationCodeRegex) || [];
      for (const code of new Set(found)) {
        if (code === item.location) continue; // don't flag the bin referencing itself
        if (!locations[code]) continue; // only flag real, valid bins
        if (!referencedBins[code]) referencedBins[code] = [];
        referencedBins[code].push({
          fromLocation: item.location,
          licensePlate: item.licensePlate,
          sku: item.sku,
          description: item.description,
          qty: item.qty,
          brand: item.brand,
          notes: item.notes,
        });
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    aisles: aisleCodes.map((code) => ({
      code,
      spots: aisleSpots[code] || DEFAULT_SPOTS_PER_AISLE,
      levels: LEVELS_PER_AISLE,
      flipped: !!aisleFlipped[code],
    })),
    locations,
    brandColors,
    actionItems,
    referencedBins,
  };
}
