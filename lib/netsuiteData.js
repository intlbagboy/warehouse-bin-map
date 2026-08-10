import path from "path";
import fs from "fs";
import { getAisleLayout, buildBrandColors, parseCSV, fetchSheetTab, BULK_AISLE_CODES } from "./aisleLayout";
import { normalizeBrand } from "./brandAliases";
import { computeMixedFlag, splitDescription } from "./serverTextUtils";
import { getHistory } from "./history";
import { getSheetPutAways } from "./sheetHistory";

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

// NetSuite's own Display Name abbreviates colors (e.g. "SPR" instead of
// "Spruce"), but the Google Sheets Transfer Log has the full English name for
// every SKU it's ever logged. Rather than guess what an abbreviation means,
// build a real SKU -> color-name lookup from that verified data and use it
// to translate NetSuite's codes wherever the same SKU has been logged there.
async function buildSkuColorMap() {
  const map = {};
  try {
    const rows = await fetchSheetTab("Transfer Log");
    for (const row of rows) {
      const sku = (row[2] || "").trim();
      const description = row[3];
      if (!sku || !description) continue;
      const { color } = splitDescription(description);
      if (color) map[sku] = color;
    }
  } catch {
    // Sheets unreachable — NetSuite mode still works, just without the
    // friendlier color names until this can be reached again.
  }
  return map;
}

function translateColor(description, sku, skuColorMap) {
  const known = skuColorMap[(sku || "").trim()];
  if (!known || !description) return description;
  const idx = description.lastIndexOf(" - ");
  if (idx === -1) return description;
  return `${description.slice(0, idx)} - ${known}`;
}

// Bulk-storage aisles (see aisleLayout.js) are one flat row of numbered
// spaces with no rack level — so NetSuite's Bin Number for one of these is
// just "W-01".."W-44", with no level segment. Every real location code
// elsewhere in the app is "aisle-spot-level" (e.g. "3A-01-1"), and a bulk
// aisle's single implicit level is always 1 — so normalize "W-01" to
// "W-01-1" here, once, rather than teaching every consumer of `bin` about
// this exception.
function normalizeBulkBin(bin) {
  const m = bin.match(/^([A-Za-z0-9]+)-(\d{1,2})$/);
  if (!m) return bin;
  const [, code, spot] = m;
  if (!BULK_AISLE_CODES.has(code)) return bin;
  return `${code}-${spot.padStart(2, "0")}-1`;
}

export async function getNetSuiteData() {
  const [{ aisles, blockedSpots }, skuColorMap] = await Promise.all([getAisleLayout(), buildSkuColorMap()]);

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
    const bin = normalizeBulkBin((binNumber || "").toString().trim());
    const sku = (name || "").toString();
    const description = translateColor((displayName || "").toString(), sku, skuColorMap);
    const matched = !!bin && validCodes.has(bin);

    allEntries.push({ sku, description, qty, brand, matched, bin });

    if (!matched) {
      unmatchedCount += 1;
      unmatchedQty += qty;
      if (!looseByBin[bin || "(no bin number)"]) looseByBin[bin || "(no bin number)"] = [];
      looseByBin[bin || "(no bin number)"].push({
        sku,
        description,
        qty,
        brand,
      });
      continue;
    }

    if (!entriesByLoc[bin]) entriesByLoc[bin] = [];
    entriesByLoc[bin].push({
      licensePlate: "",
      sku,
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

  const drillDownEntries = allEntries.map((e) => {
    const { base, color } = splitDescription(e.description);
    return {
      brand: e.brand || "(unspecified)",
      style: base || "(unspecified)",
      color: color || "(unspecified)",
      qty: e.qty,
      matched: e.matched,
      bin: e.bin,
    };
  });

  let history = { days: [], deltas: [] };
  try {
    history = getHistory(validCodes);
  } catch {
    // Reading data/history/ failed for some reason — don't let the History
    // tab break the rest of the page, it'll just show its empty state.
  }

  // Also pull real put-away events already logged in the Google Sheets
  // Transfer Log — these predate the NetSuite archive and don't need
  // diffing, since each row is a direct record of a placement. Sheets-only
  // days don't have a known total inventory count, so onRack/queue/pct stay
  // null for them rather than guessing — the day-by-day put-away number is
  // still real and shown either way.
  try {
    const logRows = await fetchSheetTab("Transfer Log");
    const sheetDays = getSheetPutAways(logRows);
    const knownDeltaDates = new Set(history.deltas.map((d) => d.date));

    // A NetSuite snapshot only shows its real onRack/queue/pct once there's
    // a second snapshot to compare it against (i.e. it has a delta) —
    // otherwise its absolute totals would sit next to a Sheets-sourced
    // put-away number for the same day, implying a before/after
    // relationship between two different measurement systems that isn't
    // actually there. Until then it's treated like any other historical day.
    const allDates = new Set([...sheetDays.map((d) => d.date), ...history.days.map((d) => d.date)]);
    const daysByDate = new Map();
    for (const date of allDates) {
      const netsuiteDay = history.days.find((d) => d.date === date);
      if (netsuiteDay && knownDeltaDates.has(date)) {
        daysByDate.set(date, netsuiteDay);
      } else {
        daysByDate.set(date, { date, onRack: null, queue: null, total: null, pct: null });
      }
    }
    const mergedDaySummaries = [...daysByDate.values()].sort((a, b) => a.date.localeCompare(b.date));

    const mergedDeltas = [
      ...sheetDays.filter((d) => !knownDeltaDates.has(d.date)),
      ...history.deltas,
    ].sort((a, b) => a.date.localeCompare(b.date));

    history = { days: mergedDaySummaries, deltas: mergedDeltas };
  } catch {
    // Sheets unreachable — History tab still works with whatever NetSuite
    // archive data is available.
  }

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
    drillDownEntries,
    history,
    fileError,
  };
}
