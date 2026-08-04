import { getAisleLayout, fetchSheetTab, buildBrandColors } from "./aisleLayout";

export async function getWarehouseData() {
  const [{ aisleCodes, aisles, blockedSpots }, logRows] = await Promise.all([
    getAisleLayout(),
    fetchSheetTab("Transfer Log"),
  ]);

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
    source: "sheets",
    sourceLabel: "Google Sheets",
    generatedAt: new Date().toISOString(),
    aisles,
    locations,
    brandColors,
    actionItems,
    referencedBins,
  };
}
