"use client";

import { useState, Fragment } from "react";

export default function BinMap({ data }) {
  const [selected, setSelected] = useState(null);

  const locations = data.locations;
  const aisles = data.aisles;
  const brandColors = data.brandColors || {};
  const brands = Object.keys(brandColors);

  return (
    <>
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
                const loc = locations[code] || { status: "empty", entries: [], qty: 0, brand: "" };
                const brandColor = loc.brand ? brandColors[loc.brand] : null;
                return (
                  <div
                    key={code}
                    className={`cell ${loc.status}`}
                    onClick={() => loc.status !== "blocked" && setSelected(code)}
                    title={loc.brand ? `${code} — ${loc.brand}` : code}
                    style={brandColor ? { borderTop: `3px solid ${brandColor}` } : undefined}
                  >
                    {loc.status === "blocked" ? "" : loc.qty > 0 ? loc.qty : ""}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ))}

      {selected && (
        <div className="panel">
          <div className="panel-header">
            <span className="panel-label">Bin</span>
            <span className="panel-code">{selected}</span>
          </div>
          {(() => {
            const loc = locations[selected];
            if (!loc || loc.entries.length === 0) {
              return <div className="muted">Empty</div>;
            }
            return (
              <table className="entry-table">
                <thead>
                  <tr>
                    <th>Brand</th>
                    <th>License plate</th>
                    <th>Item</th>
                    <th className="col-qty">Qty</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loc.entries.map((e, i) => (
                    <Fragment key={i}>
                      <tr>
                        <td>
                          {e.brand && (
                            <span className="brand-tag" style={{ background: brandColors[e.brand] || "#999" }}>
                              {e.brand}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="code-badge">{e.licensePlate}</span>
                        </td>
                        <td>
                          <div className="item-sku">{e.sku}</div>
                          <div className="item-desc">{e.description}</div>
                        </td>
                        <td className="col-qty qty-value">{e.qty}</td>
                        <td>
                          {e.verified ? (
                            <span className="status-badge verified">Verified</span>
                          ) : (
                            <span className="status-badge needs-review">Needs review</span>
                          )}
                        </td>
                      </tr>
                      {!e.verified && e.notes && (
                        <tr>
                          <td colSpan={5}>
                            <div className="action-note">Action: {e.notes}</div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>
      )}
    </>
  );
}
