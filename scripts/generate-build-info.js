// Runs automatically before every build (npm's "prebuild" lifecycle hook).
// Stamps the real wall-clock time the build ran, which is what the app shows
// as "data as of" — much more reliable than reading the deployed file's
// filesystem mtime, which doesn't reflect real update time in Vercel's build
// environment (it was showing nonsense dates like 10/19/18).
//
// Since every Zapier push to data/netsuite-inventory.csv triggers a fresh
// Vercel deployment automatically, this timestamp tracks real data updates
// correctly in the normal case. The only edge case is a code-only deploy
// (no CSV change) refreshing the timestamp without new data — a minor
// cosmetic imprecision, not a functional problem.
const fs = require("fs");
const path = require("path");

const info = { builtAt: new Date().toISOString() };
const outPath = path.join(__dirname, "..", "data", "build-info.json");

fs.writeFileSync(outPath, JSON.stringify(info));
console.log(`Wrote ${outPath}:`, info);
