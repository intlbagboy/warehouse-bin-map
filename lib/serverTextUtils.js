// Item descriptions are formatted "Base Name - Color" (e.g.
// "Stowaway 45L Duffel - Spruce"). Split on the last " - " so base names that
// happen to contain dashes elsewhere aren't broken.
export function splitDescription(desc) {
  if (!desc) return { base: "", color: "" };
  const idx = desc.lastIndexOf(" - ");
  if (idx === -1) return { base: desc.trim(), color: "" };
  return { base: desc.slice(0, idx).trim(), color: desc.slice(idx + 3).trim() };
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
