export default function TabBar({ tabs, active, source }) {
  if (!tabs || tabs.length <= 1) return null;
  return (
    <div className="tab-bar">
      {tabs.map((t) => (
        <a
          key={t.key}
          href={`/?source=${source}&tab=${t.key}`}
          className={`tab-btn${active === t.key ? " active" : ""}`}
        >
          {t.label}
        </a>
      ))}
    </div>
  );
}
