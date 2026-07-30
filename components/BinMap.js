"use client";

import { useState } from "react";

export default function BinMap({ data }) {
  const [selected, setSelected] = useState(null);

  const locations = data.locations;
  const aisles = data.aisles;

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
                const loc = locations[code] || { status: "empty", entries: [], qty: 0 };
                return (
                  <div
                    key={code}
                    className={`cell ${loc.status}`}
                    onClick={() => loc.status !== "blocked" && setSelected(code)}
                    title={code}
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
          <div className="panel-code">{selected}</div>
          {(() => {
            const loc = locations[selected];
            if (!loc || loc.entries.length === 0) {
              return <div className="muted">Empty</div>;
            }
            return loc.entries.map((e, i) => (
              <div className="entry-row" key={i}>
                LP {e.licensePlate} — {e.sku} · {e.description} · qty {e.qty}
                {!e.verified && <span className="not-verified">NOT VERIFIED</span>}
              </div>
            ));
          })()}
        </div>
      )}
    </>
  );
}
