const SHEET_ID = process.env.GOOGLE_SHEET_ID || "1GVfWUVK0VbPUGXIEMqqHdYoDsyrg27d6";

const SPOTS_PER_AISLE = 22;
const LEVELS_PER_AISLE = 4;

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

  const blockedSpots = new Set(blockedRows.map((r) => r[0]).filter(Boolean));

  // location code -> list of transfer entries
  const entriesByLoc = {};
  for (const row of logRows) {
    const [, lp, sku, desc, qty, uom, loc, by, verified] = row;
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
    });
  }

  const locations = {};
  for (const aisle of aisleCodes) {
    for (let spot = 1; spot <= SPOTS_PER_AISLE; spot++) {
      const spotKey = `${aisle}-${spot}`;
      const isBlocked = blockedSpots.has(spotKey);
      for (let level = 1; level <= LEVELS_PER_AISLE; level++) {
        const code = `${aisle}-${String(spot).padStart(2, "0")}-${level}`;
        if (isBlocked) {
          locations[code] = { status: "blocked", entries: [], qty: 0 };
          continue;
        }
        const entries = entriesByLoc[code] || [];
        if (entries.length === 0) {
          locations[code] = { status: "empty", entries: [], qty: 0 };
          continue;
        }
        const needsReview = entries.some((e) => !e.verified);
        const qty = entries.reduce((sum, e) => sum + (e.qty || 0), 0);
        locations[code] = {
          status: needsReview ? "review" : "occupied",
          entries,
          qty,
        };
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    aisles: aisleCodes.map((code) => ({
      code,
      spots: SPOTS_PER_AISLE,
      levels: LEVELS_PER_AISLE,
    })),
    locations,
  };
}
