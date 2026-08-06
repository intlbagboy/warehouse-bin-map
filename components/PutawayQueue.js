"use client";

import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";

const DEFAULT_SHOWN = 60;

function entryMatches(entry, query) {
  const haystacks = [entry.sku, entry.description, entry.brand];
  return haystacks.some((h) => h && h.toLowerCase().includes(query));
}

export default function PutawayQueue({ looseBins, brandColors }) {
  const searchParams = useSearchParams();
  const initialPlate = searchParams.get("plate");
  const [query, setQuery] = useState(initialPlate || "");
  const [selected, setSelected] = useState(initialPlate || null);

  const normalizedQuery = query.trim().toLowerCase();
  const searching = normalizedQuery.length > 0;

  const filtered = useMemo(() => {
    if (!searching) return looseBins;
    return looseBins.filter(
      (b) => b.bin.toLowerCase().includes(normalizedQuery) || b.entries.some((e) => entryMatches(e, normalizedQuery))
    );
  }, [looseBins, normalizedQuery, searching]);

  const shown = searching ? filtered : filtered.slice(0, DEFAULT_SHOWN);
  const selectedBin = selected ? looseBins.find((b) => b.bin === selected) : null;

  const totalQty = looseBins.reduce((sum, b) => sum + b.qty, 0);

  return (
    <div className="putaway-queue">
      <div className="putaway-header">
        <div>
          <div className="putaway-title">Putaway Queue</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {looseBins.length.toLocaleString()} license plates not yet on a designated rack location —{" "}
            {totalQty.toLocaleString()} units total
          </div>
        </div>
      </div>

      <div className="search-bar">
        <div className="search-input-wrap">
          <input
            type="text"
            className="search-input"
            placeholder="Search license plate, SKU, description, or brand…"
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

      <div className="putaway-layout">
        <div className="putaway-grid">
          {shown.map((b) => (
            <button
              key={b.bin}
              className={`putaway-chip${selected === b.bin ? " selected" : ""}`}
              onClick={() => setSelected(b.bin)}
            >
              <span className="putaway-chip-bin">{b.bin}</span>
              <span className="putaway-chip-qty">{b.qty.toLocaleString()} units</span>
            </button>
          ))}
          {!searching && looseBins.length > DEFAULT_SHOWN && (
            <div className="muted putaway-more">
              Showing top {DEFAULT_SHOWN} by quantity of {looseBins.length.toLocaleString()} — search to find a
              specific license plate.
            </div>
          )}
          {searching && filtered.length === 0 && <span className="muted">No license plates match &quot;{query}&quot;.</span>}
        </div>

        <div className="map-side">
          <div className="panel">
            {!selectedBin && (
              <div className="panel-placeholder muted">Click a license plate to see what&apos;s on it.</div>
            )}
            {selectedBin && (
              <>
                <div className="panel-header">
                  <span className="panel-label">License plate</span>
                  <span className="panel-code">{selectedBin.bin}</span>
                </div>
                {selectedBin.entries.map((e, i) => (
                  <div className="entry-card" key={i}>
                    <div className="entry-card-top">
                      {e.brand ? (
                        <span className="brand-tag" style={{ background: brandColors[e.brand]?.color || "#999" }}>
                          {e.brand}
                        </span>
                      ) : (
                        <span />
                      )}
                    </div>
                    <div className="entry-field">
                      <span className="field-label">Item</span>
                      <div className="item-sku">{e.sku}</div>
                      <div className="item-desc">{e.description}</div>
                    </div>
                    <div className="entry-field">
                      <span className="field-label">Qty</span>
                      <span className="qty-value">{e.qty.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
