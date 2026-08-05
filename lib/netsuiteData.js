import path from "path";
import fs from "fs";
import { getAisleLayout, buildBrandColors, parseCSV } from "./aisleLayout";
import { normalizeBrand } from "./brandAliases";
import { computeMixedFlag, splitDescription } from "./serverTextUtils";

// NetSuite's scheduled saved-search email delivers a CSV attachment, not
// Excel — so this reads CSV directly rather than parsing an .xlsx file.
const NETSUITE_FILE_PATH = path.join(process.cwd(), "data", "netsuite-inventory.csv");

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

function readNetsuiteRows() {
  const text = fs.readFileSync(NETSUITE_FILE_PATH, "utf-8");
  const allRows = parseCSV(text);
  if (allRows.length === 0) return { columnIndex: {}, rows: [] };
  const columnIndex = buildColumnIndex(allRows[0]);
  return { columnIndex, rows: allRows.slice(1) };
}

export async function getNetSuiteData() {
  const { aisles, blockedSpots } = await getAisleLayout();

  let rows = [];
  let columnIndex = {};
  let fileError = null;
  try {
    ({ columnIndex, rows } = readNetsuiteRows());
    if (rows.length > 0 && (columnIndex.binNumber === -1 || columnIndex.name === -1)) {
      fileError =
        "The NetSuite export is missing expected columns (Name / Bin Number). Check that the saved search still includes those fields.";
      rows = [];
    }
  } catch (e) {
    fileError =
      "Couldn't read the NetSuite inventory file. Make sure data/netsuite-inventory.csv has been uploaded to the repo.";
  }

  // Every real Aisle-Spot-Level code, so we can tell "already on a rack"
  // apart from "still sitting in a staging/transfer bin" per NetSuite.
  const validCodes = new Set();
  for (const aisle of aisles) {
    for (let spot = 1; spot <= aisle.spots; spot++) {
      for (let level = 1; level <= aisle.levels; level++) {
        validCodes.add(`${aisle.code}-${String(spot).padStart(2, "0")}-${level}`);
      }
    }
  }

  const entriesByLoc = {};
  const looseByBin = {};
  const brandsSeen = [];
  const allEntries = []; // every row, matched or not — feeds the Drill Down tab
  let unmatchedCount = 0;
  let unmatchedQty = 0;

  for (const row of rows) {
    const name = row[columnIndex.name];
    if (!name) continue;
    const displayName = columnIndex.displayName !== -1 ? row[columnIndex.displayName] : "";
    const binNumber = columnIndex.binNumber !== -1 ? row[columnIndex.binNumber] : "";
    const onHand = columnIndex.onHand !== -1 ? row[columnIndex.onHand] : 0;
    const rawBrand = columnIndex.brandClass !== -1 ? row[columnIndex.brandClass] : "";

    const qty = Number(onHand) || 0;
    const brand = normalizeBrand(rawBrand);
    if (brand) brandsSeen.push(brand);
    const bin = (binNumber || "").toString().trim();
    const description = (displayName || "").toString();
    const matched = !!bin && validCodes.has(bin);

    allEntries.push({ sku: (name || "").toString(), description, qty, brand, matched });

    if (!matched) {
      unmatchedCount += 1;
      unmatchedQty += qty;
      if (!looseByBin[bin || "(no bin number)"]) looseByBin[bin || "(no bin number)"] = [];
      looseByBin[bin || "(no bin number)"].push({
        sku: (name || "").toString(),
        description,
        qty,
        brand,
      });
      continue;
    }

    if (!entriesByLoc[bin]) entriesByLoc[bin] = [];
    entriesByLoc[bin].push({
      licensePlate: "",
      sku: (name || "").toString(),
      description,
      qty,
      uom: "",
      transferredBy: "",
      verified: true, // NetSuite is treated as authoritative — no review workflow here
      notes: "",
      brand,
    });
  }

  const looseBins = Object.entries(looseByBin)
    .map(([bin, entries]) => ({
      bin,
      qty: entries.reduce((sum, e) => sum + (e.qty || 0), 0),
      entries,
    }))
    .sort((a, b) => b.qty - a.qty);

  const brandColors = buildBrandColors(brandsSeen);

  const locations = {};
  const mixedBins = [];
  for (const aisle of aisles) {
    for (let spot = 1; spot <= aisle.spots; spot++) {
      const spotKey = `${aisle.code}-${spot}`;
      const isBlocked = blockedSpots.has(spotKey);
      for (let level = 1; level <= aisle.levels; level++) {
        const code = `${aisle.code}-${String(spot).padStart(2, "0")}-${level}`;
        if (isBlocked) {
          locations[code] = { status: "blocked", entries: [], qty: 0, brand: "" };
          continue;
        }
        const entries = entriesByLoc[code] || [];
        if (entries.length === 0) {
          locations[code] = { status: "empty", entries: [], qty: 0, brand: "" };
          continue;
        }
        const qty = entries.reduce((sum, e) => sum + (e.qty || 0), 0);
        const brand = entries[0].brand || "";
        const mixed = computeMixedFlag(entries);
        locations[code] = {
          status: "occupied",
          entries,
          qty,
          brand,
          mixed: mixed.isMixed,
          mixedStyleCount: mixed.styleCount,
          mixedColorCount: mixed.colorCount,
        };
        if (mixed.isMixed) {
          mixedBins.push({ location: code, ...mixed, entries });
        }
      }
    }
  }

  const BUILD_INFO_PATH = path.join(process.cwd(), "data", "build-info.json");
  let builtAt = null;
  try {
    const raw = fs.readFileSync(BUILD_INFO_PATH, "utf-8");
    builtAt = JSON.parse(raw).builtAt;
  } catch {
    // No build-info.json (e.g. `next dev` without a prior `npm run build`) —
    // fall back to "now" rather than the unreliable deployed-file mtime.
  }

  const drillDown = {
    byBrand: aggregateByDimension(allEntries, (e) => e.brand),
    byStyle: aggregateByDimension(allEntries, (e) => splitDescription(e.description).base),
    byColor: aggregateByDimension(allEntries, (e) => splitDescription(e.description).color),
  };

  return {
    source: "netsuite",
    sourceLabel: "NetSuite",
    generatedAt: builtAt || new Date().toISOString(),
    aisles,
    locations,
    brandColors,
    actionItems: [],
    referencedBins: {},
    unmatchedCount,
    unmatchedQty,
    looseBins,
    mixedBins,
    drillDown,
    fileError,
  };
}

// Groups entries by whatever dimensionFn extracts (brand / style / color),
// splitting each group's quantity into "on a rack" vs "still in the putaway
// queue", so the Drill Down tab can show a completion % per value.
function aggregateByDimension(entries, dimensionFn) {
  const map = new Map();
  for (const e of entries) {
    const key = (dimensionFn(e) || "").trim() || "(unspecified)";
    if (!map.has(key)) map.set(key, { onRack: 0, queue: 0 });
    const bucket = map.get(key);
    if (e.matched) bucket.onRack += e.qty;
    else bucket.queue += e.qty;
  }
  return [...map.entries()]
    .map(([name, v]) => {
      const total = v.onRack + v.queue;
      return {
        name,
        onRack: v.onRack,
        queue: v.queue,
        total,
        pct: total > 0 ? v.onRack / total : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}
