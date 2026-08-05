"use client";

import { useRouter } from "next/navigation";

export default function SourceToggle({ current }) {
  const router = useRouter();

  function go(source) {
    if (source === current) return;
    // NetSuite is the primary/default source now — leaving it for the
    // secondary Google Sheets view needs a deliberate confirmation.
    // No confirmation needed going the other way, back to primary.
    if (source === "sheets" && current === "netsuite") {
      const ok = window.confirm(
        "Switch to Google Sheets? NetSuite is the primary source — Sheets is a secondary check."
      );
      if (!ok) return;
    }
    router.push(`/?source=${source}`);
  }

  return (
    <div className="source-toggle">
      <button
        className={`source-toggle-btn netsuite${current === "netsuite" ? " active" : ""}`}
        onClick={() => go("netsuite")}
      >
        NetSuite
      </button>
      <button
        className={`source-toggle-btn sheets${current === "sheets" ? " active" : ""}`}
        onClick={() => go("sheets")}
      >
        Google Sheets
      </button>
    </div>
  );
}
