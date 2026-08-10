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
  {
    key: "blocked",
    label: "Blocked (beam)",
    color: "repeating-linear-gradient(45deg, rgba(220,38,38,0.35) 0px, rgba(220,38,38,0.35) 4px, #2c2e34 4px, #2c2e34 9px)",
  },
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

function AisleJumpSelect({ aisles }) {
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
    if (!q) return aisles;
    return aisles.filter((a) => a.code.toLowerCase().includes(q));
  }, [text, aisles]);

  function jumpTo(code) {
    const el = document.querySelector(`[data-aisle-code="${code}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setOpen(false);
    setText("");
  }

  return (
    <div className="combo" ref={ref}>
      <span className="combo-label">Jump to</span>
      <div className="combo-input-wrap">
        <input
          type="text"
          className="search-input"
          placeholder="Jump to aisle…"
          value={open ? text : ""}
          onFocus={() => {
            setOpen(true);
            setText("");
          }}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      {open && (
        <div className="combo-list">
          {filtered.length === 0 && <div className="combo-empty muted">No matches</div>}
          {filtered.map((a) => (
            <div key={a.code} className="combo-option" onClick={() => jumpTo(a.code)}>
              Aisle {a.code}
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
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(null);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [selectedStyle, setSelectedStyle] = useState(null);
  const [selectedColor, setSelectedColor] = useState(null);
  // Aisles with zero inventory anywhere in them collapse to a slim header by
  // default (see emptyAisleMap below) — this tracks ones the person has
  // manually expanded (or re-collapsed) to override that default.
  const [expandedEmptyAisles, setExpandedEmptyAisles] = useState(() => new Set());

  function toggleEmptyAisle(code) {
    setExpandedEmptyAisles((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  // The input's displayed value updates instantly (typing never feels
  // delayed), but the actual filtering — which scans every location — only
  // recomputes once typing pauses for 300ms. Without this, typing on mobile
  // felt like it was buffering, since every single keystroke triggered a
  // full re-filter of the whole dataset.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Coming here via a "?bin=..." link (e.g. from the Mixed Styles/Colors
  // tables) — scroll straight to that bin once, on first load.
  useEffect(() => {
    if (!initialBin) return;
    const el = document.querySelector(`[data-code="${initialBin}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") setSelected(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const locations = data.locations;
  const aisles = data.aisles;
  const brandColors = data.brandColors || {};
  const brands = Object.keys(brandColors);
  const referencedBins = data.referencedBins || {};
  const loc = selected ? locations[selected] : null;
  const selectedRefs = selected ? referencedBins[selected] : null;

  const normalizedQuery = debouncedQuery.trim().toLowerCase();
  const searching = normalizedQuery.length > 0;

  // Every distinct style (the base name half of "Base Name - Color"), which
  // brand(s) each style occurs under, and which colors occur for each
  // style — broken down further by brand+style so the Brand filter can
  // narrow Style and Color, and Style can narrow Color, in one direction.
  const { allStyles, allColors, stylesByBrand, colorsByStyle, colorsByBrandStyle } = useMemo(() => {
    const styleSet = new Set();
    const colorSet = new Set();
    const brandStyleMap = new Map(); // brand -> Set(style)
    const styleColorMap = new Map(); // style -> Set(color)
    const brandStyleColorMap = new Map(); // "brand||style" -> Set(color)
    for (const l of Object.values(locations)) {
      for (const e of l.entries || []) {
        const { base, color } = splitDescription(e.description);
        if (!base) continue;
        styleSet.add(base);
        if (e.brand) {
          if (!brandStyleMap.has(e.brand)) brandStyleMap.set(e.brand, new Set());
          brandStyleMap.get(e.brand).add(base);
        }
        if (color) {
          colorSet.add(color);
          if (!styleColorMap.has(base)) styleColorMap.set(base, new Set());
          styleColorMap.get(base).add(color);
          if (e.brand) {
            const key = `${e.brand}||${base}`;
            if (!brandStyleColorMap.has(key)) brandStyleColorMap.set(key, new Set());
            brandStyleColorMap.get(key).add(color);
          }
        }
      }
    }
    return {
      allStyles: [...styleSet].sort(),
      allColors: [...colorSet].sort(),
      stylesByBrand: brandStyleMap,
      colorsByStyle: styleColorMap,
      colorsByBrandStyle: brandStyleColorMap,
    };
  }, [locations]);

  const styleOptions = useMemo(() => {
    if (!selectedBrand) return allStyles;
    return [...(stylesByBrand.get(selectedBrand) || new Set())].sort();
  }, [selectedBrand, stylesByBrand, allStyles]);

  const colorOptions = useMemo(() => {
    if (selectedBrand && selectedStyle) {
      return [...(colorsByBrandStyle.get(`${selectedBrand}||${selectedStyle}`) || new Set())].sort();
    }
    if (selectedStyle) {
      return [...(colorsByStyle.get(selectedStyle) || new Set())].sort();
    }
    if (selectedBrand) {
      const set = new Set();
      for (const style of stylesByBrand.get(selectedBrand) || []) {
        for (const c of colorsByStyle.get(style) || []) set.add(c);
      }
      return [...set].sort();
    }
    return allColors;
  }, [selectedBrand, selectedStyle, colorsByBrandStyle, colorsByStyle, stylesByBrand, allColors]);

  // If picking a brand makes the current style selection invalid, drop it.
  useEffect(() => {
    if (selectedStyle && !styleOptions.includes(selectedStyle)) {
      setSelectedStyle(null);
    }
  }, [styleOptions, selectedStyle]);

  // If switching brand/style makes the current color selection invalid, drop it.
  useEffect(() => {
    if (selectedColor && !colorOptions.includes(selectedColor)) {
      setSelectedColor(null);
    }
  }, [colorOptions, selectedColor]);

  const filtering =
    searching || statusFilter !== null || selectedBrand !== null || selectedStyle !== null || selectedColor !== null;

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

          const needsEntryCheck = searching || selectedBrand || selectedStyle || selectedColor;
          if (needsEntryCheck) {
            const hasMatch = cellLoc.entries.some((e) => {
              if (searching && !entryMatchesText(e, normalizedQuery)) return false;
              if (selectedBrand && e.brand !== selectedBrand) return false;
              if (selectedStyle || selectedColor) {
                const { base, color } = splitDescription(e.description);
                if (selectedStyle && base !== selectedStyle) return false;
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
  }, [normalizedQuery, searching, statusFilter, selectedBrand, selectedStyle, selectedColor, filtering, aisles, locations]);

  const matchSet = useMemo(() => new Set(matches), [matches]);

  // Which aisles have at least one match — used to hide non-matching aisles
  // entirely while a search/filter is active, so you don't have to scroll
  // past irrelevant ones to reach the results.
  const matchedAisleCodes = useMemo(() => {
    if (!filtering) return null;
    const set = new Set();
    for (const code of matches) set.add(code.split("-")[0]);
    return set;
  }, [filtering, matches]);

  // Aisles with no inventory anywhere in them (every spot/level is "empty")
  // collapse to a slim header by default, independent of any active search.
  const emptyAisleMap = useMemo(() => {
    const map = {};
    for (const aisle of aisles) {
      let empty = true;
      for (let level = 1; empty && level <= aisle.levels; level++) {
        for (let spot = 1; spot <= aisle.spots; spot++) {
          const code = `${aisle.code}-${String(spot).padStart(2, "0")}-${level}`;
          const cellLoc = locations[code];
          if (cellLoc && cellLoc.status !== "empty") {
            empty = false;
            break;
          }
        }
      }
      map[aisle.code] = empty;
    }
    return map;
  }, [aisles, locations]);

  const statusLabel = statusFilter ? STATUS_OPTIONS.find((s) => s.key === statusFilter)?.label : null;
  const filterParts = [];
  if (searching) filterParts.push(`"${debouncedQuery}"`);
  if (statusLabel) filterParts.push(statusLabel);
  if (selectedBrand) filterParts.push(selectedBrand);
  if (selectedStyle) filterParts.push(selectedStyle);
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
          <AisleJumpSelect aisles={aisles} />
        </div>

        <div className="combo-row">
          <SearchableSelect label="Brand" options={brands} value={selectedBrand} onChange={setSelectedBrand} />
          <SearchableSelect label="Style" options={styleOptions} value={selectedStyle} onChange={setSelectedStyle} />
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
          // A search/filter is active and this aisle has no matches — skip
          // it entirely rather than making people scroll past it.
          if (filtering && !matchedAisleCodes.has(aisle.code)) return null;

          const isEmptyAisle = emptyAisleMap[aisle.code];
          // Empty aisles collapse to a header by default; the person can
          // expand one manually. That default is overridden entirely while
          // a search/filter is active — an aisle only gets this far if it
          // has matches, so it should render in full.
          const collapsed = !filtering && isEmptyAisle && !expandedEmptyAisles.has(aisle.code);

          if (collapsed) {
            return (
              <div className="aisle-block aisle-collapsed" data-aisle-code={aisle.code} key={aisle.code}>
                <button
                  type="button"
                  className="aisle-title aisle-title-toggle"
                  onClick={() => toggleEmptyAisle(aisle.code)}
                >
                  <span className="aisle-chevron">▸</span>
                  Aisle {aisle.code}
                  {aisle.flipped && <span className="aisle-flipped-tag">flipped</span>}
                  <span className="aisle-empty-tag">Empty aisle</span>
                </button>
              </div>
            );
          }

          const spotOrder = aisle.flipped
            ? Array.from({ length: aisle.spots }, (_, i) => aisle.spots - i)
            : Array.from({ length: aisle.spots }, (_, i) => i + 1);

          return (
            <div className="aisle-block" data-aisle-code={aisle.code} key={aisle.code}>
              <div className="aisle-title">
                {isEmptyAisle ? (
                  <button
                    type="button"
                    className="aisle-title-toggle"
                    onClick={() => toggleEmptyAisle(aisle.code)}
                  >
                    <span className="aisle-chevron aisle-chevron-open">▾</span>
                    Aisle {aisle.code}
                    {aisle.flipped && <span className="aisle-flipped-tag">flipped</span>}
                    <span className="aisle-empty-tag">Empty aisle</span>
                  </button>
                ) : (
                  <>
                    Aisle {aisle.code}
                    {aisle.flipped && <span className="aisle-flipped-tag">flipped</span>}
                  </>
                )}
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

      {selected && (
        <div className="bin-modal-backdrop" onClick={() => setSelected(null)}>
          <div className="bin-modal" onClick={(e) => e.stopPropagation()}>
            <button className="bin-modal-close" onClick={() => setSelected(null)} aria-label="Close">
              ×
            </button>

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
          </div>
        </div>
      )}
    </div>
  );
}
