import { getWarehouseData } from "../lib/sheetData";
import BinMap from "../components/BinMap";

export const revalidate = 60; // re-fetch the sheet at most once a minute

function computeStats(data) {
  const values = Object.values(data.locations);
  const total = values.length;
  const blocked = values.filter((l) => l.status === "blocked").length;
  const occupied = values.filter((l) => l.status === "occupied").length;
  const review = values.filter((l) => l.status === "review").length;
  const usable = total - blocked;
  const empty = usable - occupied - review;
  return { total, blocked, usable, occupied, review, empty };
}

export default async function Home() {
  let data;
  let error;
  try {
    data = await getWarehouseData();
  } catch (e) {
    error = e.message;
  }

  if (error) {
    return (
      <main>
        <h1>Warehouse Bin Map</h1>
        <p className="subtitle">Couldn&apos;t load live data: {error}</p>
      </main>
    );
  }

  const stats = computeStats(data);
  const pctComplete = stats.usable > 0 ? ((stats.occupied + stats.review) / stats.usable) * 100 : 0;

  return (
    <main>
      <h1>Warehouse Bin Map</h1>
      <p className="subtitle">
        Live from Google Sheets — last checked{" "}
        {new Date(data.generatedAt).toLocaleString("en-US", {
          timeZone: "America/Chicago",
          dateStyle: "short",
          timeStyle: "medium",
        })}{" "}
        CT. Refreshes automatically about once a minute.
      </p>

      <div className="stats">
        <div className="stat-card">
          <div className="stat-label">Usable locations</div>
          <div className="stat-value">{stats.usable}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Occupied</div>
          <div className="stat-value">{stats.occupied + stats.review}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Needs review</div>
          <div className="stat-value">{stats.review}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Blocked (beam)</div>
          <div className="stat-value">{stats.blocked}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">% complete</div>
          <div className="stat-value">{pctComplete.toFixed(1)}%</div>
        </div>
      </div>

      <BinMap data={data} />

      {data.actionItems && data.actionItems.length > 0 && (
        <div className="action-items">
          <div className="action-items-title">
            Action items — {data.actionItems.length} unverified transfer
            {data.actionItems.length === 1 ? "" : "s"}
          </div>
          {data.actionItems.map((item, i) => (
            <div className="action-item-row" key={i}>
              <span className="action-item-loc">{item.location}</span>
              {item.brand && <span className="brand-tag" style={{ background: data.brandColors[item.brand] || "#999" }}>{item.brand}</span>}
              LP {item.licensePlate} — {item.sku} · {item.description} · qty {item.qty}
              <div className="action-note">Action: {item.notes || "No note provided — check with whoever logged this transfer."}</div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
