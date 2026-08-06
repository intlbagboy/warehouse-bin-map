"use client";

import { useState, useMemo, Fragment } from "react";

function sum(arr, fn) {
  return arr.reduce((s, x) => s + fn(x), 0);
}

// Small hand-rolled SVG line chart — avoids pulling in a charting library
// for one line. Plots % complete over time. Only days with a known total
// (i.e. from a real NetSuite snapshot) have a pct — Sheets-logged days
// don't have an absolute total to compute against, so they're excluded here
// rather than plotted as a misleading 0%.
function TrendChart({ days }) {
  const plottable = days.filter((d) => d.pct !== null && d.pct !== undefined);
  if (plottable.length === 0) {
    return <div className="muted">Not enough NetSuite-snapshot days yet to chart a trend.</div>;
  }

  const width = 640;
  const height = 160;
  const padding = { top: 12, right: 12, bottom: 24, left: 36 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const points = plottable.map((d, i) => {
    const x = padding.left + (plottable.length === 1 ? innerW / 2 : (i / (plottable.length - 1)) * innerW);
    const y = padding.top + innerH * (1 - d.pct);
    return { x, y, d };
  });

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="trend-chart" role="img" aria-label="Percent complete over time">
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = padding.top + innerH * (1 - t);
        return (
          <g key={t}>
            <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="trend-gridline" />
            <text x={padding.left - 8} y={y + 4} textAnchor="end" className="trend-axis-label">
              {(t * 100).toFixed(0)}%
            </text>
          </g>
        );
      })}
      <path d={path} className="trend-line" fill="none" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3.5} className="trend-dot">
          <title>
            {p.d.date}: {(p.d.pct * 100).toFixed(1)}% complete
          </title>
        </circle>
      ))}
    </svg>
  );
}

function DayChanges({ delta }) {
  if (!delta) return null;
  return (
    <table className="entry-table drilldown-table">
      <thead>
        <tr>
          <th className="col-bin">Bin</th>
          <th>Item</th>
          <th className="col-qty">Change</th>
        </tr>
      </thead>
      <tbody>
        {delta.changes.map((c, i) => (
          <tr key={i}>
            <td className="col-bin">
              <span className="code-badge">{c.bin}</span>
            </td>
            <td>
              <div className="item-sku">{c.sku}</div>
              <div className="item-desc">{c.description}</div>
            </td>
            <td className="col-qty qty-value" style={{ color: c.delta > 0 ? "#8fe3bb" : "#f2a3a3" }}>
              {c.delta > 0 ? "+" : ""}
              {c.delta.toLocaleString()}
            </td>
          </tr>
        ))}
        {delta.changes.length === 0 && (
          <tr>
            <td colSpan={3} className="muted">
              No changes recorded this day.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export default function HistoryDashboard({ days, deltas }) {
  const [expandedDate, setExpandedDate] = useState(null);

  const latestWithPct = [...days].reverse().find((d) => d.pct !== null && d.pct !== undefined);
  const todayPutAway = deltas.length > 0 ? deltas[deltas.length - 1].putAway : 0;
  const last7 = deltas.slice(-7);
  const last7PutAway = sum(last7, (d) => d.putAway);

  const deltaByDate = useMemo(() => {
    const map = new Map();
    for (const d of deltas) map.set(d.date, d);
    return map;
  }, [deltas]);

  if (days.length === 0) {
    return (
      <div className="drilldown">
        <div className="muted">
          No historical data yet. Once the Zapier automation starts archiving daily snapshots to{" "}
          <span className="code-badge">data/history/</span>, this dashboard fills in automatically — check back after
          the next scheduled run.
        </div>
      </div>
    );
  }

  if (days.length === 1) {
    return (
      <div className="drilldown">
        <div className="muted">
          Tracking started on {days[0].date}. Come back after the next daily archive to see day-over-day progress —
          need at least two days of history to show a trend.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="stats" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Put away — latest day</div>
          <div className="stat-value">{todayPutAway.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Put away — last 7 days</div>
          <div className="stat-value">{last7PutAway.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Current % complete</div>
          <div className="stat-value">{latestWithPct ? `${(latestWithPct.pct * 100).toFixed(1)}%` : "—"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Days tracked</div>
          <div className="stat-value">{days.length}</div>
        </div>
      </div>

      <div className="drilldown">
        <div className="drilldown-subheading" style={{ marginTop: 0 }}>
          % complete over time
        </div>
        <TrendChart days={days} />
      </div>

      <div className="drilldown">
        <div className="drilldown-subheading" style={{ marginTop: 0 }}>
          Day by day
        </div>
        <table className="entry-table drilldown-table">
          <thead>
            <tr>
              <th>Date</th>
              <th className="col-qty">Put away</th>
              <th className="col-qty">On racks</th>
              <th className="col-qty">Queue</th>
              <th className="col-pct">% Complete</th>
            </tr>
          </thead>
          <tbody>
            {days
              .slice()
              .reverse()
              .map((d) => {
                const delta = deltaByDate.get(d.date);
                const isExpanded = expandedDate === d.date;
                return (
                  <Fragment key={d.date}>
                    <tr
                      className={delta ? "drilldown-row-clickable" : ""}
                      onClick={() => delta && setExpandedDate(isExpanded ? null : d.date)}
                    >
                      <td>
                        {d.date}
                        {delta && <span className="drill-arrow"> {isExpanded ? "▾" : "›"}</span>}
                      </td>
                      <td className="col-qty qty-value" style={{ color: delta ? "#8fe3bb" : undefined }}>
                        {delta ? `+${delta.putAway.toLocaleString()}` : "—"}
                      </td>
                      <td className="col-qty qty-value">{d.onRack !== null ? d.onRack.toLocaleString() : "—"}</td>
                      <td className="col-qty qty-value">{d.queue !== null ? d.queue.toLocaleString() : "—"}</td>
                      <td className="col-pct">{d.pct !== null ? `${(d.pct * 100).toFixed(1)}%` : "—"}</td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={5} style={{ background: "rgba(255,255,255,0.02)" }}>
                          <DayChanges delta={delta} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
