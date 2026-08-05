// Some sources (e.g. NetSuite's Display Name) export descriptions in ALL
// CAPS, while others (e.g. the Transfer Log) use normal title case for the
// exact same product — which would otherwise show up as two different
// styles/colors. Normalize ALL-CAPS strings to title case so they merge,
// while leaving short codes (size codes, SKU-ish tokens, anything with a
// digit) alone rather than guessing how to case them.
function normalizeCase(s) {
  if (!s) return s;
  const isShouty = s === s.toUpperCase() && s !== s.toLowerCase();
  if (!isShouty) return s;
  return s
    .split(" ")
    .map((word) => {
      const alnum = word.replace(/[^a-zA-Z0-9]/g, "");
      if (/[0-9]/.test(word) || alnum.length <= 3 || word.length === 0) return word;
      return word.charAt(0) + word.slice(1).toLowerCase();
    })
    .join(" ");
}

// Item descriptions are formatted "Base Name - Color" (e.g.
// "Stowaway 45L Duffel - Spruce"). Split on the last " - " so base names that
// happen to contain dashes elsewhere aren't broken.
export function splitDescription(desc) {
  if (!desc) return { base: "", color: "" };
  const idx = desc.lastIndexOf(" - ");
  if (idx === -1) return { base: normalizeCase(desc.trim()), color: "" };
  return {
    base: normalizeCase(desc.slice(0, idx).trim()),
    color: normalizeCase(desc.slice(idx + 3).trim()),
  };
}

// Flags a bin as "mixed" if it holds more than one distinct style, or the
// same style in more than one color — either way, worth a human glancing at
// it to confirm that's intentional rather than a putaway mistake.
export function computeMixedFlag(entries) {
  const styles = new Set();
  const colors = new Set();
  for (const e of entries) {
    const { base, color } = splitDescription(e.description);
    if (base) styles.add(base);
    if (color) colors.add(color);
  }
  const isMixed = styles.size > 1 || colors.size > 1;
  return { isMixed, styleCount: styles.size, colorCount: colors.size, styles: [...styles], colors: [...colors] };
}
