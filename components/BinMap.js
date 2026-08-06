"use client";

import { useState, useMemo, useEffect, useRef, Fragment } from "react";
import { useSearchParams } from "next/navigation";

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
//
// NOTE: this is intentionally duplicated from lib/serverTextUtils.js rather
// than imported from a shared module. Sharing one file between this client
// component and the server-side data modules (sheetData.js/netsuiteData.js)
// previously caused a "module not found in the React Client Manifest" crash
// in production on Vercel (not reproducible in local builds) — keeping
// client and server code fully separate avoids that class of bug entirely.
function splitDescription(desc) {
  if (!desc) return { base: "", color: "" };
  const idx = desc.lastIndexOf(" - ");
  if (idx === -1) return { base: normalizeCase(desc.trim()), color: "" };
  return {
    base: normalizeCase(desc.slice(0, idx).trim()),
    color: normalizeCase(desc.slice(idx + 3).trim()),
  };
}

function computeMixedFlag(entries) {
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

const STATUS_OPTIONS = [
  { key: "occupied", label: "Occupied", color: "#134e35" },
  { key: "review", label: "Needs review", color: "#5c4a12" },
  { key: "blocked", label: "Blocked (beam)", color: "#34363d" },
  { key: "empty", label: "Empty", color: "rgba(255,255,255,0.06)" },
];

function entryMatchesText(entry, query) {
  const haystacks = [entry.sku, entry.description, entry.brand, entry.licensePlate];
  return haystacks.some((h) => h && h.toLowerCase().includes(query));
}

function SearchableSelect({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [text, options]);

  return (
    <div className="combo" ref={ref}>
      <span className="combo-label">{label}</span>
      <div className="combo-input-wrap">
        <input
          type="text"
          className="search-input"
          placeholder={`All ${label.toLowerCase()}s`}
          value={open ? text : value || ""}
          onFocus={() => {
            setOpen(true);
            setText("");
          }}
          onChange={(e) => setText(e.target.value)}
        />
        {value && !open && (
          <button
            className="search-clear"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            aria-label={`Clear ${label}`}
          >
            ×
          </button>
        )}
      </div>
      {open && (
        <div className="combo-list">
          <div
            className="combo-option combo-option-all"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            All {label.toLowerCase()}s
          </div>
          {filtered.length === 0 && <div className="combo-empty muted">No matches</div>}
          {filtered.map((opt) => (
            <div
              key={opt}
              className={`combo-option${opt === value ? " selected" : ""}`}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BinMap({ data }) {
  const searchParams = useSearchParams();
  const initialBin = searchParams.get("bin");
  const [selected, setSelected] = useState(initialBin || null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(null);
  const [selectedDescription, setSelectedDescription] = useState(null);
  const [selectedColor, setSelectedColor] = useState(null);

  // Coming here via a "?bin=..." link (e.g. from the Mixed Styles/Colors
  // tables) — scroll straight to that bin once, on first load.
  useEffect(() => {
    if (!initialBin) return;
    const el = document.querySelector(`[data-code="${initialBin}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locations = data.locations;
  const aisles = data.aisles;
  const brandColors = data.brandColors || {};
  const brands = Object.keys(brandColors);
  const referencedBins = data.referencedBins || {};
  const loc = selected ? locations[selected] : null;
  const selectedRefs = selected ? referencedBins[selected] : null;

  const normalizedQuery = query.trim().toLowerCase();
  const searching = normalizedQuery.length > 0;

  // Every distinct base description, and which colors actually occur for each one.
  const { descriptions, colorsByDescription, allColors } = useMemo(() => {
    const descSet = new Set();
    const colorMap = new Map();
    const colorSet = new Set();
    for (const l of Object.values(locations)) {
      for (const e of l.entries || []) {
        const { base, color } = splitDescription(e.description);
        if (!base) continue;
        descSet.add(base);
        if (color) {
          colorSet.add(color);
          if (!colorMap.has(base)) colorMap.set(base, new Set());
          colorMap.get(base).add(color);
        }
      }
    }
    return {
      descriptions: [...descSet].sort(),
      colorsByDescription: colorMap,
      allColors: [...colorSet].sort(),
    };
  }, [locations]);

  const colorOptions = useMemo(() => {
    if (!selectedDescription) return allColors;
    return [...(colorsByDescription.get(selectedDescription) || new Set())].sort();
  }, [selectedDescription, colorsByDescription, allColors]);

  // If switching descriptions makes the current color selection invalid, drop it.
  useEffect(() => {
    if (selectedColor && !colorOptions.includes(selectedColor)) {
      setSelectedColor(null);
    }
  }, [colorOptions, selectedColor]);

  const filtering = searching || statusFilter !== null || selectedDescription !== null || selectedColor !== null;

  const matches = useMemo(() => {
    if (!filtering) return [];
    const found = [];
    for (const aisle of aisles) {
      for (let level = aisle.levels; level >= 1; level--) {
        for (let spot = 1; spot <= aisle.spots; spot++) {
          const code = `${aisle.code}-${String(spot).padStart(2, "0")}-${level}`;
          const cellLoc = locations[code];
          if (!cellLoc) continue;
          if (statusFilter && cellLoc.status !== statusFilter) continue;

          const needsEntryCheck = searching || selectedDescription || selectedColor;
          if (needsEntryCheck) {
            const hasMatch = cellLoc.entries.some((e) => {
              if (searching && !entryMatchesText(e, normalizedQuery)) return false;
              if (selectedDescription || selectedColor) {
                const { base, color } = splitDescription(e.description);
                if (selectedDescription && base !== selectedDescription) return false;
                if (selectedColor && color !== selectedColor) return false;
              }
              return true;
            });
            if (!hasMatch) continue;
          }

          found.push(code);
        }
      }
    }
    return found;
  }, [normalizedQuery, searching, statusFilter, selectedDescription, selectedColor, filtering, aisles, locations]);

  const matchSet = useMemo(() => new Set(matches), [matches]);

  const statusLabel = statusFilter ? STATUS_OPTIONS.find((s) => s.key === statusFilter)?.label : null;
  const filterParts = [];
  if (searching) filterParts.push(`"${query}"`);
  if (statusLabel) filterParts.push(statusLabel);
  if (selectedDescription) filterParts.push(selectedDescription);
  if (selectedColor) filterParts.push(selectedColor);

  return (
    <div className="map-layout">
      <div className="map-main">
        <div className="canvas-controls">
        <div className="search-bar">
          <div className="search-input-wrap">
            <input
              type="text"
              className="search-input"
              placeholder="Search SKU, description, brand, or license plate…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button className="search-clear" onClick={() => setQuery("")} aria-label="Clear search">
                ×
              </button>
            )}
          </div>
        </div>

        <div className="combo-row">
          <SearchableSelect
            label="Description"
            options={descriptions}
            value={selectedDescription}
            onChange={setSelectedDescription}
          />
          <SearchableSelect label="Color" options={colorOptions} value={selectedColor} onChange={setSelectedColor} />
        </div>

        {filtering && (
          <div className="search-results">
            {matches.length === 0 ? (
              <span className="muted">No bins match {filterParts.join(" · ")}.</span>
            ) : (
              <>
                <span className="muted" style={{ marginRight: 8 }}>
                  {matches.length} match{matches.length === 1 ? "" : "es"}
                  {filterParts.length ? ` — ${filterParts.join(" · ")}` : ""}:
                </span>
                {matches.map((code) => (
                  <button key={code} className="search-chip" onClick={() => setSelected(code)}>
                    {code}
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        <div className="legend">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              className={`legend-btn${statusFilter === opt.key ? " active" : ""}`}
              onClick={() => setStatusFilter(statusFilter === opt.key ? null : opt.key)}
            >
              <span className="legend-swatch" style={{ background: opt.color }} />
              {opt.label}
            </button>
          ))}
          {statusFilter && (
            <button className="legend-reset" onClick={() => setStatusFilter(null)}>
              Clear filter
            </button>
          )}
        </div>

        <div className="legend flag-legend">
          <span className="flag-badge-sample">!</span>
          <span className="muted">Mentioned in another bin&apos;s action-item note — may not be where it belongs</span>
        </div>

        <div className="legend flag-legend">
          <span className="mixed-dot-sample" style={{ background: "linear-gradient(135deg, transparent 50%, #f97316 50%)" }} />
          <span className="muted">Mixed styles in one bin</span>
        </div>

        <div className="legend flag-legend">
          <span className="mixed-dot-sample" style={{ background: "linear-gradient(135deg, transparent 50%, #eab308 50%)" }} />
          <span className="muted">Same style, mixed colors, in one bin</span>
        </div>

        {brands.length > 0 && (
          <div className="legend brand-legend">
            <span className="muted" style={{ marginRight: 4 }}>
              Brand (top stripe):
            </span>
            {brands.map((b) => (
              <span key={b}>
                <span
                  className="brand-swatch"
                  style={{ borderTopColor: brandColors[b]?.color, borderTopStyle: brandColors[b]?.pattern }}
                />
                {b}
              </span>
            ))}
          </div>
        )}
        </div>

        {aisles.map((aisle) => {
          const spotOrder = aisle.flipped
            ? Array.from({ length: aisle.spots }, (_, i) => aisle.spots - i)
            : Array.from({ length: aisle.spots }, (_, i) => i + 1);

          return (
            <div className="aisle-block" key={aisle.code}>
              <div className="aisle-title">
                Aisle {aisle.code}
                {aisle.flipped && <span className="aisle-flipped-tag">flipped</span>}
              </div>

              <div className="grid-row">
                <div className="level-label" />
                {spotOrder.map((spot) => (
                  <div className="spot-header" key={spot}>
                    {spot}
                  </div>
                ))}
              </div>

              {Array.from({ length: aisle.levels }, (_, i) => aisle.levels - i).map((level) => (
                <div className="grid-row" key={level}>
                  <div className="level-label">L{level}</div>
                  {spotOrder.map((spot) => {
                    const code = `${aisle.code}-${String(spot).padStart(2, "0")}-${level}`;
                    const cellLoc = locations[code] || { status: "empty", entries: [], qty: 0, brand: "" };
                    const brandStyle = cellLoc.brand ? brandColors[cellLoc.brand] : null;
                    const isMatch = filtering && matchSet.has(code);
                    const isDimmed = filtering && !isMatch;
                    const refs = referencedBins[code];
                    let className = `cell ${cellLoc.status}`;
                    if (selected === code) className += " selected";
                    if (isMatch) className += " match";
                    if (isDimmed) className += " dimmed";
                    if (refs && refs.length > 0) className += " flagged";
                    if (cellLoc.mixed) className += " mixed-contents";
                    const mixedIsStyles = cellLoc.mixedStyleCount > 1;
                    const mixedColor = mixedIsStyles ? "#f97316" : "#eab308";
                    const titleParts = [code];
                    if (cellLoc.brand) titleParts.push(cellLoc.brand);
                    if (refs && refs.length > 0) titleParts.push("mentioned in another bin's note — click for details");
                    if (cellLoc.mixed) titleParts.push(mixedIsStyles ? "mixed styles — click for details" : "mixed colors — click for details");
                    return (
                      <div
                        key={code}
                        data-code={code}
                        className={className}
                        onClick={() => cellLoc.status !== "blocked" && setSelected(code)}
                        title={titleParts.join(" — ")}
                        style={
                          brandStyle
                            ? { borderTop: `3px ${brandStyle.pattern} ${brandStyle.color}` }
                            : undefined
                        }
                      >
                        {refs && refs.length > 0 && <span className="flag-badge">!</span>}
                        {cellLoc.mixed && (
                          <span
                            className="mixed-dot"
                            style={{ background: `linear-gradient(135deg, transparent 50%, ${mixedColor} 50%)` }}
                          />
                        )}
                        {cellLoc.status === "blocked" ? "" : cellLoc.qty > 0 ? cellLoc.qty : ""}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className="map-side">
        <div className="panel">
          {!selected && (
            <div className="panel-placeholder muted">Click a bin to see what&apos;s stored there.</div>
          )}

          {selected && (
            <>
              <div className="panel-header">
                <span className="panel-label">Bin</span>
                <span className="panel-code">{selected}</span>
              </div>

              {loc && loc.mixed && (
                <div
                  className="mixed-note"
                  style={{ borderLeftColor: computeMixedFlag(loc.entries).styleCount > 1 ? "#f97316" : "#eab308" }}
                >
                  {(() => {
                    const m = computeMixedFlag(loc.entries);
                    const parts = [];
                    if (m.styleCount > 1) parts.push(`${m.styleCount} styles`);
                    if (m.colorCount > 1) parts.push(`${m.colorCount} colors`);
                    return `Mixed contents — ${parts.join(", ")}`;
                  })()}
                </div>
              )}

              {!loc || loc.entries.length === 0 ? (
                <div className="muted">Empty</div>
              ) : (
                loc.entries.map((e, i) => (
                  <div className="entry-card" key={i}>
                    <div className="entry-card-top">
                      {e.brand ? (
                        <span className="brand-tag" style={{ background: brandColors[e.brand]?.color || "#999" }}>
                          {e.brand}
                        </span>
                      ) : (
                        <span />
                      )}
                      {e.verified ? (
                        <span className="status-badge verified">Verified</span>
                      ) : (
                        <span className="status-badge needs-review">Needs review</span>
                      )}
                    </div>

                    <div className="entry-field">
                      <span className="field-label">License plate</span>
                      <span className="code-badge">{e.licensePlate}</span>
                    </div>

                    <div className="entry-field">
                      <span className="field-label">Item</span>
                      <div className="item-sku">{e.sku}</div>
                      <div className="item-desc">{e.description}</div>
                    </div>

                    <div className="entry-field">
                      <span className="field-label">Qty</span>
                      <span className="qty-value">{e.qty}</span>
                    </div>

                    {!e.verified && e.notes && <div className="action-note">Action: {e.notes}</div>}
                  </div>
                ))
              )}

              {selectedRefs && selectedRefs.length > 0 && (
                <div className="entry-card">
                  <div className="flag-callout-title">
                    <span className="flag-badge">!</span> Mentioned in another bin&apos;s note
                  </div>
                  {selectedRefs.map((r, i) => (
                    <div key={i} className="flag-callout">
                      <div className="action-note">
                        Note logged at <span className="code-badge">{r.fromLocation}</span>: {r.notes}
                      </div>
                      <div className="entry-field" style={{ marginTop: 10 }}>
                        <span className="field-label">Item mentioned</span>
                        <div className="item-sku">{r.sku}</div>
                        <div className="item-desc">{r.description}</div>
                      </div>
                      <div className="entry-field">
                        <span className="field-label">Qty</span>
                        <span className="qty-value">{r.qty}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
