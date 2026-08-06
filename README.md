# Warehouse bin map

A live, color-coded map of the warehouse relocation tracker: occupied, needs-review,
blocked, and empty bins, with click-through detail (license plate, SKU, item, qty).

Data comes from either a live Google Sheet or a dropped-in NetSuite export —
toggle between them right on the page. No manual export/regenerate step for
the Sheets side.

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

This app includes its own login page (`app/login`, `app/api/login`, `middleware.js`)
so it isn't publicly accessible — Vercel's built-in Password Protection requires a
paid add-on, so this does the same job for free. It uses a real login page with a
signed cookie rather than the browser's native HTTP Basic Auth popup, since that
popup is unreliable on mobile — some phone browsers (especially in-app browsers
opened from Messages/Slack/etc.) fail to render it at all, leaving a blank screen.

To turn it on:

1. In Vercel: **Project Settings → Environment Variables**.
2. Add these (for the **Production** environment):
   - `SITE_USERNAME`
   - `SITE_PASSWORD`
   - `AUTH_SECRET` — optional but recommended: any long random string, used to
     sign the login cookie. If omitted, `SITE_PASSWORD` is used instead.
3. Redeploy (Vercel → Deployments → click the latest → **Redeploy**), since env var
   changes need a fresh deployment to take effect.

Once set, visiting any page redirects to `/login` until the right username/password
is entered. The session is remembered for 30 days via a cookie (httpOnly, secure).
Share those credentials only with people who should have access. Leaving
`SITE_USERNAME`/`SITE_PASSWORD` unset leaves the site open — useful for local
development, but make sure both are set in Vercel itself.

### The Google Sheet is a separate exposure

The site reads the Google Sheet anonymously, so the sheet itself has to stay shared
as "Anyone with the link." That means anyone who has the *sheet* link (not just the
site link) can view the raw data, regardless of the site's password. Practically:
treat the sheet's URL as sensitive and don't share it beyond people who should see
the underlying data. If you want the sheet itself locked down too (not just
link-shared), that requires switching to an authenticated fetch (a Google Cloud
service account with Sheets API access) instead of the anonymous CSV export this
app currently uses — a bigger change, let me know if you want that instead.

## Two data sources: Google Sheets and NetSuite

The site can show either of two views, switched with the toggle at the top of
the page (`?source=sheets` or `?source=netsuite` in the URL):

- **Google Sheets** — your manually-tracked relocation data (Transfer Log,
  Needs Review, etc.), same as before.
- **NetSuite** — a snapshot of NetSuite's own inventory-by-bin export. Since
  NetSuite's "Bin Number" is only sometimes one of your Aisle-Spot-Level codes
  (a lot of inventory is still sitting in staging/transfer bins, not yet on a
  rack), only rows whose Bin Number matches a real location show up on the
  grid. Everything else is counted in the "Not yet on a rack" stat instead of
  being silently dropped. This mode is a good cross-check against what you've
  tracked manually — if NetSuite and the Sheets view disagree about what's in
  a given bin, something's off.

Both modes share the same physical layout (aisles, spot counts, orientation,
blocked spots) from the Aisle List / Spots Blocked by Beams tabs in the Google
Sheet — only the inventory data itself differs.

### Updating the NetSuite data

**Automated (recommended):** NetSuite's saved search is scheduled to email a
CSV export daily. A Zapier automation watches for that email, grabs the
attachment, and commits it to this repo as `data/netsuite-inventory.csv`,
which triggers a Vercel redeploy automatically — no manual steps.

**Manual (if needed):** drop a new NetSuite CSV export in as
`data/netsuite-inventory.csv` (same filename, replacing the old one) via
GitHub's "Upload files" on that file's page, commit, and Vercel redeploys
automatically.

Expected columns: Name (SKU), Display Name (description), Bin Number, On
Hand, Class (brand). Columns are matched by **header name**, not position, so
NetSuite reordering or adding columns won't break anything — only a renamed
header would. The mapping is in `lib/netsuiteData.js`
(`COLUMN_ALIASES`) if that ever needs adjusting.

## Deploying to Vercel

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. Go to [vercel.com](https://vercel.com), click **Add New → Project**, and import
   the repo.
3. Leave the default settings (Vercel auto-detects Next.js) and click **Deploy**.
4. In Sheets mode, the page re-checks the Google Sheet every minute — no redeploy
   needed. In NetSuite mode, data only changes when you push a new
   `data/netsuite-inventory.csv` (see above). Either way, you only need to
   redeploy if the code itself changes.

## Project structure

```
app/page.js                   Main page — fetches data (Sheets or NetSuite), stats + map
lib/sheetData.js               Google Sheets data source (Transfer Log, Needs Review, etc.)
lib/netsuiteData.js            NetSuite data source (reads data/netsuite-inventory.csv)
lib/aisleLayout.js             Shared: aisle list, spot counts, orientation, blocked spots
components/SourceToggle.js     The Google Sheets / NetSuite switcher
components/BinMap.js           Interactive grid (client component) — same for both sources
data/netsuite-inventory.csv   Drop-in NetSuite export — replace this file to update
data/locations.json            Legacy static snapshot — no longer used
scripts/export_data.py         Legacy: regenerated data/locations.json from Excel
```

## Note on `npm audit`

`npm audit` will flag a high-severity advisory in `sharp`, a dependency Next.js
pulls in for its image optimizer. This app never uses `next/image`, so it isn't
exploitable here — safe to ignore until an upstream fix lands.

