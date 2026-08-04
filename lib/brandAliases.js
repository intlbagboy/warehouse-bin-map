// Maps a raw brand/Class string (as it appears in the Transfer Log's Brand
// column or NetSuite's "Class (no hierarchy)" column) to the canonical brand
// name it should be grouped and colored under. Only list entries here for
// values that should be merged into something else — anything not listed
// just uses its own raw value as-is.
//
// Add to this list any time NetSuite/the sheet introduces a new sub-line,
// regional variant, or category-prefixed class that should really count as
// an existing brand.
export const BRAND_ALIASES = {
  "Reebok - Delta": "Reebok",
  "Reebok - Kids": "Reebok",
  "Apparel - Wolverine": "Wolverine",
  // Best guess based on SKU prefixes (EBB...) and existing "Eddie Bauer"
  // entries elsewhere — flag if these two actually mean something else.
  "EB - B&W": "Eddie Bauer",
  "EB - BL&A": "Eddie Bauer",
};

export function normalizeBrand(raw) {
  const trimmed = (raw || "").toString().trim();
  if (!trimmed) return "";
  return BRAND_ALIASES[trimmed] || trimmed;
}
