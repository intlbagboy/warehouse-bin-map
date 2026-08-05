"use client";

import { useState, useMemo } from "react";

const DIMENSIONS = [
  { key: "byBrand", label: "Brand" },
  { key: "byStyle", label: "Style" },
  { key: "byColor", label: "Color" },
];

export default function DrillDown({ drillDown }) {
  const [dimension, setDimension] = useState("byBrand");
  const [query, setQuery] = useState("");

  const rows = drillDown?.[dimension] || [];
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!normalizedQuery) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(normalizedQuery));
  }, [rows, normalizedQuery]);

  const totals = useMemo(() => {
    const onRack = filtered.reduce((s, r) => s + r.onRack, 0);
    const queue = filtered.reduce((s, r) => s + r.queue, 0);
    const total = onRack + queue;
    return { onRack, queue, total, pct: total > 0 ? onRack / total : 0 };
  }, [filtered]);

  const dimLabel = DIMENSIONS.find((d) => d.key === dimension)?.label || "";

  return (
    <div className="drilldown">
      <div className="drilldown-header">
        <div className="dim-switch">
          {DIMENSIONS.map((d) => (
            <button
              key={d.key}
              className={`dim-btn${dimension === d.key ? " active" : ""}`}
              onClick={() => setDimension(d.key)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          className="search-input drilldown-search"
          placeholder={`Filter by ${dimLabel.toLowerCase()}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="drilldown-summary">
        {filtered.length} {dimLabel.toLowerCase()}{filtered.length === 1 ? "" : "s"} shown — {totals.onRack.toLocaleString()} on
        racks / {totals.total.toLocaleString()} total ({(totals.pct * 100).toFixed(1)}% putaway complete)
      </div>

      <table className="entry-table drilldown-table">
        <thead>
          <tr>
            <th>{dimLabel}</th>
            <th className="col-qty">On racks</th>
            <th className="col-qty">Putaway queue</th>
            <th className="col-qty">Total</th>
            <th className="col-pct">% Putaway</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td className="col-qty qty-value">{r.onRack.toLocaleString()}</td>
              <td className="col-qty qty-value">{r.queue.toLocaleString()}</td>
              <td className="col-qty qty-value">{r.total.toLocaleString()}</td>
              <td className="col-pct">
                <div className="pct-bar-wrap">
                  <div className="pct-bar-track">
                    <div className="pct-bar-fill" style={{ width: `${Math.round(r.pct * 100)}%` }} />
                  </div>
                  <span className="pct-bar-label">{(r.pct * 100).toFixed(0)}%</span>
                </div>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No {dimLabel.toLowerCase()} matches &quot;{query}&quot;.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
