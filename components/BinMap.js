"use client";

import { useState, Fragment } from "react";

export default function BinMap({ data }) {
  const [selected, setSelected] = useState(null);

  const locations = data.locations;
  const aisles = data.aisles;
  const brandColors = data.brandColors || {};
  const brands = Object.keys(brandColors);
  const loc = selected ? locations[selected] : null;

  return (
    <div className="map-layout">
      <div className="map-main">
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
                  return (
                    <div
                      key={code}
                      className={`cell ${cellLoc.status}${selected === code ? " selected" : ""}`}
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
