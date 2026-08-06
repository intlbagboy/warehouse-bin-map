"use client";

import { useState, useMemo } from "react";

const LEVELS = [
  { key: "brand", label: "Brand" },
  { key: "style", label: "Style" },
  { key: "color", label: "Color" },
];

// Red -> amber -> green, interpolated smoothly rather than in hard buckets,
// so 40% and 60% read as visibly different, not just "both yellow-ish."
const RED = [220, 38, 38];
const AMBER = [217, 119, 6];
const GREEN = [5, 150, 105];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function pctColor(pct) {
  const stops = pct <= 0.5 ? [RED, AMBER, pct / 0.5] : [AMBER, GREEN, (pct - 0.5) / 0.5];
  const [from, to, t] = stops;
  const rgb = from.map((c, i) => Math.round(lerp(c, to[i], t)));
  return `rgb(${rgb.join(",")})`;
}

function aggregate(entries, key) {
  const map = new Map();
  for (const e of entries) {
    const name = e[key];
    if (!map.has(name)) map.set(name, { onRack: 0, queue: 0 });
    const b = map.get(name);
    if (e.matched) b.onRack += e.qty;
    else b.queue += e.qty;
  }
  return [...map.entries()]
    .map(([name, v]) => ({
      name,
      onRack: v.onRack,
      queue: v.queue,
      total: v.onRack + v.queue,
      pct: v.onRack + v.queue > 0 ? v.onRack / (v.onRack + v.queue) : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

// Groups the finest-grain entries (already filtered to one exact
// brand+style+color) by their actual bin/location code, splitting into bins
// already on a rack vs. still-staged locations (the putaway queue).
function groupByBin(entries) {
  const map = new Map();
  for (const e of entries) {
    const key = e.bin || "(no bin)";
    if (!map.has(key)) map.set(key, { bin: key, qty: 0, matched: e.matched });
    map.get(key).qty += e.qty;
  }
  const all = [...map.values()];
  return {
    onRack: all.filter((b) => b.matched).sort((a, b) => b.qty - a.qty),
    queue: all.filter((b) => !b.matched).sort((a, b) => b.qty - a.qty),
  };
}

export default function DrillDown({ entries, source }) {
  const [path, setPath] = useState([]); // e.g. ["Eddie Bauer", "Stowaway 45L Duffel", "Spruce"]
  const [query, setQuery] = useState("");

  const atBinLevel = path.length === LEVELS.length;
  const level = atBinLevel ? null : LEVELS[path.length];
  const canDrillDeeper = !atBinLevel;

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => path.every((val, i) => e[LEVELS[i].key] === val));
  }, [entries, path]);

  const rows = useMemo(() => (atBinLevel ? [] : aggregate(filteredEntries, level.key)), [filteredEntries, level, atBinLevel]);

  const normalizedQuery = query.trim().toLowerCase();
  const shownRows = useMemo(() => {
    if (!normalizedQuery) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(normalizedQuery));
  }, [rows, normalizedQuery]);

  const totals = useMemo(() => {
    const onRack = shownRows.reduce((s, r) => s + r.onRack, 0);
    const queue = shownRows.reduce((s, r) => s + r.queue, 0);
    const total = onRack + queue;
    return { onRack, queue, total, pct: total > 0 ? onRack / total : 0 };
  }, [shownRows]);

  const binGroups = useMemo(() => (atBinLevel ? groupByBin(filteredEntries) : { onRack: [], queue: [] }), [filteredEntries, atBinLevel]);

  const binFiltered = useMemo(() => {
    if (!normalizedQuery) return binGroups;
    return {
      onRack: binGroups.onRack.filter((b) => b.bin.toLowerCase().includes(normalizedQuery)),
      queue: binGroups.queue.filter((b) => b.bin.toLowerCase().includes(normalizedQuery)),
    };
  }, [binGroups, normalizedQuery]);

  // Putaway-queue entries are colored by their own quantity relative to the
  // other staged locations for this exact color — biggest remaining = reddest,
  // smallest = greenest. There's no per-location "% already unloaded" in the
  // NetSuite export (no ID links partial loads of the same pallet over time),
  // so this is a relative-size signal, not a true progress percentage.
  const queueRange = useMemo(() => {
    if (binFiltered.queue.length === 0) return { min: 0, max: 0 };
    const qtys = binFiltered.queue.map((b) => b.qty);
    return { min: Math.min(...qtys), max: Math.max(...qtys) };
  }, [binFiltered]);

  function queueColor(qty) {
    const { min, max } = queueRange;
    if (max === min) return pctColor(0.5);
    return pctColor(1 - (qty - min) / (max - min));
  }

  function drillInto(name) {
    if (!canDrillDeeper) return;
    setPath([...path, name]);
    setQuery("");
  }

  function jumpTo(index) {
    // index === -1 means back to the very top (all brands)
    setPath(path.slice(0, index + 1));
    setQuery("");
  }

  return (
    <div className="drilldown">
      <div className="drilldown-breadcrumb">
        <button className="crumb" onClick={() => jumpTo(-1)}>
          All brands
        </button>
        {path.map((val, i) => (
          <span key={i}>
            <span className="crumb-sep">›</span>
            <button className="crumb" onClick={() => jumpTo(i)}>
              {val}
            </button>
          </span>
        ))}
      </div>

      <input
        type="text"
        className="search-input drilldown-search"
        placeholder={atBinLevel ? "Filter by bin…" : `Filter by ${level.label.toLowerCase()}…`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {!atBinLevel && (
        <>
          <div className="drilldown-summary">
            {shownRows.length} {level.label.toLowerCase()}
            {shownRows.length === 1 ? "" : "s"} shown — {totals.onRack.toLocaleString()} on racks /{" "}
            {totals.total.toLocaleString()} total ({(totals.pct * 100).toFixed(1)}% putaway complete)
          </div>

          <table className="entry-table drilldown-table">
            <thead>
              <tr>
                <th>{level.label}</th>
                <th className="col-qty">On racks</th>
                <th className="col-qty">Putaway queue</th>
                <th className="col-qty">Total</th>
                <th className="col-pct">% Putaway</th>
              </tr>
            </thead>
            <tbody>
              {shownRows.map((r) => (
                <tr key={r.name} className="drilldown-row-clickable" onClick={() => drillInto(r.name)}>
                  <td>
                    {r.name}
                    <span className="drill-arrow"> ›</span>
                  </td>
                  <td className="col-qty qty-value">{r.onRack.toLocaleString()}</td>
                  <td className="col-qty qty-value">{r.queue.toLocaleString()}</td>
                  <td className="col-qty qty-value">{r.total.toLocaleString()}</td>
                  <td className="col-pct">
                    <div className="pct-bar-wrap">
                      <div className="pct-bar-track">
                        <div
                          className="pct-bar-fill"
                          style={{ width: `${Math.round(r.pct * 100)}%`, background: pctColor(r.pct) }}
                        />
                      </div>
                      <span className="pct-bar-label" style={{ color: pctColor(r.pct) }}>
                        {(r.pct * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {shownRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No {level.label.toLowerCase()} matches &quot;{query}&quot;.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}

      {atBinLevel && (
        <>
          <div className="drilldown-summary">
            {binFiltered.onRack.length} bin{binFiltered.onRack.length === 1 ? "" : "s"} on racks — {binFiltered.queue.length}{" "}
            location{binFiltered.queue.length === 1 ? "" : "s"} in the putaway queue
          </div>

          <div className="drilldown-subheading">On racks</div>
          <table className="entry-table drilldown-table">
            <thead>
              <tr>
                <th className="col-bin">Bin</th>
                <th className="col-qty">Qty</th>
              </tr>
            </thead>
            <tbody>
              {binFiltered.onRack.map((b) => (
                <tr key={b.bin}>
                  <td className="col-bin">
                    <a
                      href={`/?source=${source}&tab=binmap&bin=${encodeURIComponent(b.bin)}`}
                      className="code-badge code-badge-link"
                    >
                      {b.bin}
                    </a>
                  </td>
                  <td className="col-qty qty-value" style={{ color: "#8fe3bb" }}>
                    {b.qty.toLocaleString()}
                  </td>
                </tr>
              ))}
              {binFiltered.onRack.length === 0 && (
                <tr>
                  <td colSpan={2} className="muted">
                    No bins on racks{query ? ` matching "${query}"` : ""}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="drilldown-subheading">Putaway queue (not yet racked)</div>
          <table className="entry-table drilldown-table">
            <thead>
              <tr>
                <th className="col-bin">Location</th>
                <th className="col-qty">Qty</th>
              </tr>
            </thead>
            <tbody>
              {binFiltered.queue.map((b) => (
                <tr key={b.bin}>
                  <td className="col-bin">
                    <span className="code-badge">{b.bin}</span>
                  </td>
                  <td className="col-qty qty-value" style={{ color: queueColor(b.qty) }}>
                    {b.qty.toLocaleString()}
                  </td>
                </tr>
              ))}
              {binFiltered.queue.length === 0 && (
                <tr>
                  <td colSpan={2} className="muted">
                    Nothing in the putaway queue{query ? ` matching "${query}"` : ""}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
