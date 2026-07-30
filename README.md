# Warehouse bin map

A live, color-coded map of the warehouse relocation tracker: occupied, needs-review,
blocked, and empty bins, with click-through detail (license plate, SKU, item, qty).

## First-time setup

1. Install [Node.js](https://nodejs.org) (v18+).
2. Install dependencies:
   ```
   npm install
   ```
3. Run locally:
   ```
   npm run dev
   ```
   Open http://localhost:3000

## Updating the data

Whenever you update the Excel tracker:

```
python3 scripts/export_data.py /path/to/Warehouse_Relocation_Tracker.xlsx
```

This regenerates `data/locations.json` from the Aisle List, Transfer Log, and Spots
Blocked by Beams tabs. Commit and push the updated JSON file to redeploy the site
with fresh data — no rebuild of the app itself is needed.

Requires `openpyxl`: `pip install openpyxl`

## Deploying to Vercel

1. Push this folder to a new GitHub repo.
2. Go to [vercel.com](https://vercel.com), click **Add New → Project**, and import
   the repo.
3. Leave the default settings (Vercel auto-detects Next.js) and click **Deploy**.
4. Every time you push an updated `data/locations.json` to the repo, Vercel
   redeploys automatically with the new data.

## Project structure

```
app/page.js            Main page — loads data/locations.json, shows stats + map
components/BinMap.js   Interactive grid (client component)
data/locations.json    Generated snapshot of the tracker — do not hand-edit
scripts/export_data.py Regenerates data/locations.json from the Excel workbook
```

## Roadmap ideas

- Swap the static JSON for a live source (Google Sheets, or a daily NetSuite
  saved-search export) so the site updates without a manual regenerate/push step.
- Add a search-by-license-plate box.
- Add per-aisle filtering once more aisles are in the tracker.

## Note on `npm audit`

`npm audit` will flag a high-severity advisory in `sharp`, a dependency Next.js
pulls in for its image optimizer. This app never uses `next/image`, so it isn't
exploitable here — safe to ignore until an upstream fix lands.
