# Warehouse bin map

A live, color-coded map of the warehouse relocation tracker: occupied, needs-review,
blocked, and empty bins, with click-through detail (license plate, SKU, item, qty).

Data now comes live from a Google Sheet — no manual export/regenerate step needed.

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

## Required: make the Google Sheet publicly viewable

This app reads the sheet anonymously (no Google API key/login), so the sheet must be
shared as **"Anyone with the link – Viewer"**:

1. Open the Google Sheet.
2. Click **Share** (top right).
3. Under "General access," change from "Restricted" to **"Anyone with the link."**
4. Make sure the role is **Viewer**.

Without this, the app will show a "Couldn't load live data" error (you'll see a 403 in
the underlying fetch).

## How the live data works

`lib/sheetData.js` fetches three tabs from the sheet as CSV (no API key required, since
Google Sheets supports anonymous CSV export for publicly-viewable sheets):

- **Aisle List** — which aisles exist
- **Transfer Log** — every license plate → location transfer, with verified Y/N
- **Spots Blocked by Beams** — which spots are physically unusable

It reconstructs the exact same status logic as the old Excel tracker: a location is
`blocked`, `empty`, `occupied`, or `review` (occupied but has an unverified entry).

The page re-fetches the sheet at most once a minute (`revalidate: 60`), so edits in
Google Sheets show up live without a redeploy.

If you rename the Google Sheet's tabs, update the tab names in `lib/sheetData.js`
(`fetchTab("Aisle List")`, etc.) to match.

To point this at a different spreadsheet, set the `GOOGLE_SHEET_ID` environment
variable in Vercel (Project Settings → Environment Variables) to the ID from the
sheet's URL (the long string between `/d/` and `/edit`).

## Password-protecting the site

This app includes its own login gate (`middleware.js`) so it isn't publicly
accessible — Vercel's built-in Password Protection requires a paid add-on, so this
does the same job for free.

To turn it on:

1. In Vercel: **Project Settings → Environment Variables**.
2. Add two variables (for the **Production** environment):
   - `SITE_USERNAME`
   - `SITE_PASSWORD`
3. Redeploy (Vercel → Deployments → click the latest → **Redeploy**), since env var
   changes need a fresh deployment to take effect.

Once set, visiting the site will prompt for a username/password (a standard browser
login popup). Share those credentials only with people who should have access.
Leaving either variable unset leaves the site open — useful for local development,
but make sure both are set in Vercel itself.

### The Google Sheet is a separate exposure

The site reads the Google Sheet anonymously, so the sheet itself has to stay shared
as "Anyone with the link." That means anyone who has the *sheet* link (not just the
site link) can view the raw data, regardless of the site's password. Practically:
treat the sheet's URL as sensitive and don't share it beyond people who should see
the underlying data. If you want the sheet itself locked down too (not just
link-shared), that requires switching to an authenticated fetch (a Google Cloud
service account with Sheets API access) instead of the anonymous CSV export this
app currently uses — a bigger change, let me know if you want that instead.

## Deploying to Vercel

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. Go to [vercel.com](https://vercel.com), click **Add New → Project**, and import
   the repo.
3. Leave the default settings (Vercel auto-detects Next.js) and click **Deploy**.
4. Every minute, the live page re-checks the Google Sheet — no redeploy needed to see
   new data. You only need to redeploy if you change the code itself.

## Project structure

```
app/page.js             Main page — fetches live sheet data, shows stats + map
lib/sheetData.js         Fetches + parses the Google Sheet tabs into the app's data shape
components/BinMap.js     Interactive grid (client component)
data/locations.json      Legacy static snapshot — no longer used by the live app
scripts/export_data.py   Legacy: regenerates data/locations.json from the Excel file
                          (only needed if you ever revert to the static-file approach)
```

## Note on `npm audit`

`npm audit` will flag a high-severity advisory in `sharp`, a dependency Next.js
pulls in for its image optimizer. This app never uses `next/image`, so it isn't
exploitable here — safe to ignore until an upstream fix lands.
