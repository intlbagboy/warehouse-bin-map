"use client";

import { useState, useMemo, Fragment } from "react";

function entryMatches(entry, query) {
  const haystacks = [entry.sku, entry.description, entry.brand, entry.licensePlate];
  return haystacks.some((h) => h && h.toLowerCase().includes(query));
}

export default function BinMap({ data }) {
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");

  const locations = data.locations;
  const aisles = data.aisles;
  const brandColors = data.brandColors || {};
  const brands = Object.keys(brandColors);
  const loc = selected ? locations[selected] : null;

  const normalizedQuery = query.trim().toLowerCase();
  const searching = normalizedQuery.length > 0;

  // All matching bin codes across every aisle, in reading order, for the jump-list.
  const matches = useMemo(() => {
    if (!searching) return [];
    const found = [];
    for (const aisle of aisles) {
      for (let level = aisle.levels; level >= 1; level--) {
        for (let spot = 1; spot <= aisle.spots; spot++) {
          const code = `${aisle.code}-${String(spot).padStart(2, "0")}-${level}`;
          const cellLoc = locations[code];
          if (cellLoc && cellLoc.entries.some((e) => entryMatches(e, normalizedQuery))) {
            found.push(code);
          }
        }
      }
    }
    return found;
  }, [normalizedQuery, searching, aisles, locations]);

  const matchSet = useMemo(() => new Set(matches), [matches]);

  return (
    <div className="map-layout">
      <div className="map-main">
        <div className="search-bar">
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

        {searching && (
          <div className="search-results">
            {matches.length === 0 ? (
              <span className="muted">No bins match &quot;{query}&quot;.</span>
            ) : (
              <>
                <span className="muted" style={{ marginRight: 8 }}>
                  {matches.length} match{matches.length === 1 ? "" : "es"}:
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
          <span>
            <span className="legend-swatch" style={{ background: "#c6efce" }} />
            Occupied
          </span>
          <span>
            <span className="legend-swatch" style={{ background: "#ffeb9c" }} />
            Needs review
          </span>
          <span>
            <span className="legend-swatch" style={{ background: "#d9d9d9" }} />
            Blocked (beam)
          </span>
          <span>
            <span className="legend-swatch" style={{ background: "#fdf2f2" }} />
            Empty
          </span>
        </div>

        {brands.length > 0 && (
          <div className="legend brand-legend">
            <span className="muted" style={{ marginRight: 4 }}>
              Brand (top stripe):
            </span>
            {brands.map((b) => (
              <span key={b}>
                <span className="legend-swatch" style={{ background: brandColors[b] }} />
                {b}
              </span>
            ))}
          </div>
        )}

        {aisles.map((aisle) => (
          <div className="aisle-block" key={aisle.code}>
            <div className="aisle-title">Aisle {aisle.code}</div>

            <div className="grid-row">
              <div className="level-label" />
              {Array.from({ length: aisle.spots }, (_, i) => i + 1).map((spot) => (
                <div className="spot-header" key={spot}>
                  {spot}
                </div>
              ))}
            </div>

            {Array.from({ length: aisle.levels }, (_, i) => aisle.levels - i).map((level) => (
              <div className="grid-row" key={level}>
                <div className="level-label">L{level}</div>
                {Array.from({ length: aisle.spots }, (_, i) => i + 1).map((spot) => {
                  const code = `${aisle.code}-${String(spot).padStart(2, "0")}-${level}`;
                  const cellLoc = locations[code] || { status: "empty", entries: [], qty: 0, brand: "" };
                  const brandColor = cellLoc.brand ? brandColors[cellLoc.brand] : null;
                  const isMatch = searching && matchSet.has(code);
                  const isDimmed = searching && !isMatch;
                  let className = `cell ${cellLoc.status}`;
                  if (selected === code) className += " selected";
                  if (isMatch) className += " match";
                  if (isDimmed) className += " dimmed";
                  return (
                    <div
                      key={code}
                      className={className}
                      onClick={() => cellLoc.status !== "blocked" && setSelected(code)}
                      title={cellLoc.brand ? `${code} — ${cellLoc.brand}` : code}
                      style={brandColor ? { borderTop: `3px solid ${brandColor}` } : undefined}
                    >
                      {cellLoc.status === "blocked" ? "" : cellLoc.qty > 0 ? cellLoc.qty : ""}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
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

              {!loc || loc.entries.length === 0 ? (
                <div className="muted">Empty</div>
              ) : (
                loc.entries.map((e, i) => (
                  <div className="entry-card" key={i}>
                    <div className="entry-card-top">
                      {e.brand ? (
                        <span className="brand-tag" style={{ background: brandColors[e.brand] || "#999" }}>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
