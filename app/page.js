import { Fragment } from "react";
import { getWarehouseData } from "../lib/sheetData";
import { getNetSuiteData } from "../lib/netsuiteData";
import BinMap from "../components/BinMap";
import SourceToggle from "../components/SourceToggle";
import TabBar from "../components/TabBar";
import PutawayQueue from "../components/PutawayQueue";
import DrillDown from "../components/DrillDown";

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

function MixedTable({ title, subtitle, bins, color, brandColors }) {
  if (!bins || bins.length === 0) return null;
  return (
    <div className="mixed-bins" style={{ borderColor: color }}>
      <div className="mixed-bins-title" style={{ color }}>
        {title} — {bins.length} bin{bins.length === 1 ? "" : "s"}
        {subtitle && <span className="mixed-bins-subtitle"> ({subtitle})</span>}
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
          {bins.map((b, i) => (
            <tr key={i}>
              <td>
                <span className="code-badge">{b.location}</span>
              </td>
              <td>
                {[...new Set(b.entries.map((e) => e.brand).filter(Boolean))].map((brand) => (
                  <span
                    key={brand}
                    className="brand-tag"
                    style={{ background: brandColors[brand]?.color || "#999", marginRight: 4 }}
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
  );
}

function ActionItemsTable({ data }) {
  if (!data.actionItems || data.actionItems.length === 0) return null;
  return (
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
  );
}

export default async function Home({ searchParams }) {
  const sp = (await searchParams) || {};
  const source = sp.source === "sheets" ? "sheets" : "netsuite";

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

  const mixedStyleBins = (data.mixedBins || []).filter((b) => b.styleCount > 1);
  const mixedColorBins = (data.mixedBins || []).filter((b) => b.styleCount <= 1 && b.colorCount > 1);

  // Tabs are built dynamically from what's actually present in the current
  // data/source, so adding a new section later is just: add its content to
  // this array with a condition, same as the existing ones.
  const tabs = [{ key: "binmap", label: "Bin Map" }];
  if (mixedStyleBins.length > 0) tabs.push({ key: "mixedstyles", label: `Mixed Styles (${mixedStyleBins.length})` });
  if (mixedColorBins.length > 0) tabs.push({ key: "mixedcolors", label: `Mixed Colors (${mixedColorBins.length})` });
  if (source === "netsuite" && data.looseBins && data.looseBins.length > 0) {
    tabs.push({ key: "putaway", label: `Putaway Queue (${data.looseBins.length})` });
  }
  if (source === "netsuite" && data.drillDownEntries && data.drillDownEntries.length > 0) {
    tabs.push({ key: "drilldown", label: "Drill Down" });
  }
  if (data.actionItems && data.actionItems.length > 0) {
    tabs.push({ key: "actions", label: `Action Items (${data.actionItems.length})` });
  }

  const activeTab = tabs.some((t) => t.key === sp.tab) ? sp.tab : "binmap";

  return (
    <main>
      <h1>Warehouse Bin Map</h1>
      <SourceToggle current={source} />

      <p className="subtitle">
        {source === "netsuite" ? "From NetSuite export — site last rebuilt" : "Live from Google Sheets — last checked"}{" "}
        {new Date(data.generatedAt).toLocaleString("en-US", {
          timeZone: "America/Chicago",
          dateStyle: "short",
          timeStyle: "medium",
        })}{" "}
        CT.{" "}
        {source === "netsuite"
          ? "Drop a new export in as data/netsuite-inventory.csv and push to update."
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
        {mixedStyleBins.length > 0 && (
          <a href={`/?source=${source}&tab=mixedstyles`} className="stat-card stat-card-link">
            <div className="stat-label">Mixed styles</div>
            <div className="stat-value">{mixedStyleBins.length}</div>
          </a>
        )}
        {mixedColorBins.length > 0 && (
          <a href={`/?source=${source}&tab=mixedcolors`} className="stat-card stat-card-link">
            <div className="stat-label">Mixed colors</div>
            <div className="stat-value">{mixedColorBins.length}</div>
          </a>
        )}
        {source === "netsuite" && (
          <a href={`/?source=${source}&tab=putaway`} className="stat-card stat-card-link">
            <div className="stat-label">Not yet on a rack</div>
            <div className="stat-value">{(data.unmatchedCount || 0).toLocaleString()}</div>
          </a>
        )}
      </div>

      <TabBar tabs={tabs} active={activeTab} source={source} />

      {activeTab === "binmap" && <BinMap data={data} />}

      {activeTab === "mixedstyles" && (
        <MixedTable
          title="Mixed styles"
          subtitle="different products sharing a bin"
          bins={mixedStyleBins}
          color="#c2410c"
          brandColors={data.brandColors}
        />
      )}

      {activeTab === "mixedcolors" && (
        <MixedTable
          title="Mixed colors"
          subtitle="same style, different colors, in one bin"
          bins={mixedColorBins}
          color="#a16207"
          brandColors={data.brandColors}
        />
      )}

      {activeTab === "putaway" && source === "netsuite" && data.looseBins && data.looseBins.length > 0 && (
        <PutawayQueue looseBins={data.looseBins} brandColors={data.brandColors} />
      )}

      {activeTab === "drilldown" && source === "netsuite" && data.drillDownEntries && data.drillDownEntries.length > 0 && (
        <DrillDown entries={data.drillDownEntries} />
      )}

      {activeTab === "actions" && <ActionItemsTable data={data} />}

      <DeployInfo />
    </main>
  );
}

function DeployInfo() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  const message = process.env.VERCEL_GIT_COMMIT_MESSAGE;
  if (!sha) return null;
  return (
    <div className="deploy-info">
      Running commit <span className="code-badge">{sha.slice(0, 7)}</span>
      {message ? ` — ${message.split("\n")[0]}` : ""}
      {" — compare against "}
      <a
        href={`https://github.com/TedBeans/MoogWarehouseMap/commit/${sha}`}
        target="_blank"
        rel="noreferrer"
      >
        GitHub
      </a>
      {" to confirm this deployment is current."}
    </div>
  );
}
