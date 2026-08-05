import { Fragment } from "react";
import { getWarehouseData } from "../lib/sheetData";
import { getNetSuiteData } from "../lib/netsuiteData";
import BinMap from "../components/BinMap";
import SourceToggle from "../components/SourceToggle";
import PutawayQueue from "../components/PutawayQueue";

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

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }) {
  const sp = (await searchParams) || {};
  const source = sp.source === "netsuite" ? "netsuite" : "sheets";

  let data;
  let error;
  try {
    data = source === "netsuite" ? await getNetSuiteData() : await getWarehouseData();
  } catch (e) {
    error = e.message;
  }

  if (error) {
    return (
      <main>
        <h1>Warehouse Bin Map</h1>
        <SourceToggle current={source} />
        <p className="subtitle">Couldn&apos;t load live data: {error}</p>
      </main>
    );
  }

  const stats = computeStats(data);
  const pctComplete = stats.usable > 0 ? ((stats.occupied + stats.review) / stats.usable) * 100 : 0;

  return (
    <main>
      <h1>Warehouse Bin Map</h1>
      <SourceToggle current={source} />

      <p className="subtitle">
        {source === "netsuite" ? "From NetSuite export, uploaded" : "Live from Google Sheets — last checked"}{" "}
        {new Date(data.generatedAt).toLocaleString("en-US", {
          timeZone: "America/Chicago",
          dateStyle: "short",
          timeStyle: "medium",
        })}{" "}
        CT.{" "}
        {source === "netsuite"
          ? "Drop a new export in as data/netsuite-inventory.xlsx and push to update."
          : "Refreshes automatically about once a minute."}
      </p>

      {data.fileError && <p className="subtitle" style={{ color: "#a3401d" }}>{data.fileError}</p>}

      <div className="stats">
        <div className="stat-card">
          <div className="stat-label">Usable locations</div>
          <div className="stat-value">{stats.usable}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Occupied</div>
          <div className="stat-value">{stats.occupied + stats.review}</div>
        </div>
        {source === "sheets" && (
          <div className="stat-card">
            <div className="stat-label">Needs review</div>
            <div className="stat-value">{stats.review}</div>
          </div>
        )}
        <div className="stat-card">
          <div className="stat-label">Blocked (beam)</div>
          <div className="stat-value">{stats.blocked}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">% complete</div>
          <div className="stat-value">{pctComplete.toFixed(1)}%</div>
        </div>
        {data.mixedBins && data.mixedBins.length > 0 && (
          <div className="stat-card">
            <div className="stat-label">Mixed styles/colors (list below)</div>
            <div className="stat-value">{data.mixedBins.length}</div>
          </div>
        )}
        {source === "netsuite" && (
          <div className="stat-card">
            <div className="stat-label">Not yet on a rack (Putaway Queue below)</div>
            <div className="stat-value">{(data.unmatchedCount || 0).toLocaleString()}</div>
          </div>
        )}
      </div>

      <BinMap data={data} />

      {data.mixedBins && data.mixedBins.length > 0 && (
        <div className="mixed-bins">
          <div className="mixed-bins-title">
            Mixed contents — {data.mixedBins.length} bin{data.mixedBins.length === 1 ? "" : "s"} with more than one
            style or color
          </div>
          <table className="entry-table">
            <thead>
              <tr>
                <th>Bin</th>
                <th>Brand</th>
                <th>Styles</th>
                <th>Colors</th>
                <th className="col-qty">Qty</th>
              </tr>
            </thead>
            <tbody>
              {data.mixedBins.map((b, i) => (
                <tr key={i}>
                  <td>
                    <span className="code-badge">{b.location}</span>
                  </td>
                  <td>
                    {[...new Set(b.entries.map((e) => e.brand).filter(Boolean))].map((brand) => (
                      <span
                        key={brand}
                        className="brand-tag"
                        style={{ background: data.brandColors[brand]?.color || "#999", marginRight: 4 }}
                      >
                        {brand}
                      </span>
                    ))}
                  </td>
                  <td>{b.styles.join(", ")}</td>
                  <td>{b.colors.join(", ") || "—"}</td>
                  <td className="col-qty qty-value">
                    {b.entries.reduce((sum, e) => sum + (e.qty || 0), 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {source === "netsuite" && data.looseBins && data.looseBins.length > 0 && (
        <PutawayQueue looseBins={data.looseBins} brandColors={data.brandColors} />
      )}

      {data.actionItems && data.actionItems.length > 0 && (
        <div className="action-items">
          <div className="action-items-title">
            Action items — {data.actionItems.length} unverified transfer
            {data.actionItems.length === 1 ? "" : "s"}
          </div>
          <table className="entry-table">
            <thead>
              <tr>
                <th>Bin</th>
                <th>Brand</th>
                <th>License plate</th>
                <th>Item</th>
                <th className="col-qty">Qty</th>
              </tr>
            </thead>
            <tbody>
              {data.actionItems.map((item, i) => (
                <Fragment key={i}>
                  <tr>
                    <td>
                      <span className="code-badge">{item.location}</span>
                    </td>
                    <td>
                      {item.brand && (
                        <span className="brand-tag" style={{ background: data.brandColors[item.brand]?.color || "#999" }}>
                          {item.brand}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="code-badge">{item.licensePlate}</span>
                    </td>
                    <td>
                      <div className="item-sku">{item.sku}</div>
                      <div className="item-desc">{item.description}</div>
                    </td>
                    <td className="col-qty qty-value">{item.qty}</td>
                  </tr>
                  <tr>
                    <td colSpan={5}>
                      <div className="action-note">
                        Action: {item.notes || "No note provided — check with whoever logged this transfer."}
                      </div>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
