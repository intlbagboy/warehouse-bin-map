import path from "path";
import fs from "fs";
import readXlsxFile from "read-excel-file/node";
import { getAisleLayout, buildBrandColors } from "./aisleLayout";

const NETSUITE_FILE_PATH = path.join(process.cwd(), "data", "netsuite-inventory.xlsx");

async function readNetsuiteRows() {
  const rows = await readXlsxFile(NETSUITE_FILE_PATH);
  return rows.slice(1); // drop header row
}

export async function getNetSuiteData() {
  const { aisles, blockedSpots } = await getAisleLayout();

  let rows = [];
  let fileError = null;
  try {
    rows = await readNetsuiteRows();
  } catch (e) {
    fileError =
      "Couldn't read the NetSuite inventory file. Make sure data/netsuite-inventory.xlsx has been uploaded to the repo.";
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
  let unmatchedCount = 0;
  let unmatchedQty = 0;

  for (const row of rows) {
    const [, name, , displayName, binNumber, onHand] = row;
    if (!name) continue;
    const qty = Number(onHand) || 0;
    const brand = (row[9] || "").toString().trim();
    if (brand) brandsSeen.push(brand);
    const bin = (binNumber || "").toString().trim();

    if (!bin || !validCodes.has(bin)) {
      unmatchedCount += 1;
      unmatchedQty += qty;
      if (!looseByBin[bin || "(no bin number)"]) looseByBin[bin || "(no bin number)"] = [];
      looseByBin[bin || "(no bin number)"].push({
        sku: (name || "").toString(),
        description: (displayName || "").toString(),
        qty,
        brand,
      });
      continue;
    }

    if (!entriesByLoc[bin]) entriesByLoc[bin] = [];
    entriesByLoc[bin].push({
      licensePlate: "",
      sku: (name || "").toString(),
      description: (displayName || "").toString(),
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
        locations[code] = { status: "occupied", entries, qty, brand };
      }
    }
  }

  let fileStat = null;
  try {
    fileStat = fs.statSync(NETSUITE_FILE_PATH);
  } catch {
    // handled by fileError above
  }

  return {
    source: "netsuite",
    sourceLabel: "NetSuite",
    generatedAt: fileStat ? fileStat.mtime.toISOString() : new Date().toISOString(),
    aisles,
    locations,
    brandColors,
    actionItems: [],
    referencedBins: {},
    unmatchedCount,
    unmatchedQty,
    looseBins,
    fileError,
  };
}
