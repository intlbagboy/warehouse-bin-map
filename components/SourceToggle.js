export default function SourceToggle({ current }) {
  return (
    <div className="source-toggle">
      <a href="/?source=sheets" className={`source-toggle-btn${current === "sheets" ? " active" : ""}`}>
        Google Sheets
      </a>
      <a href="/?source=netsuite" className={`source-toggle-btn${current === "netsuite" ? " active" : ""}`}>
        NetSuite
      </a>
    </div>
  );
}
