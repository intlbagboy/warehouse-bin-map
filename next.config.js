/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensure data/netsuite-inventory.csv (read at runtime via fs, not imported)
  // gets bundled into the serverless function on Vercel.
  outputFileTracingIncludes: {
    "/": ["./data/**"],
  },
};

module.exports = nextConfig;
