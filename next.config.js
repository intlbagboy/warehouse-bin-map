/** @type {import('next').NextConfig} */
const nextConfig = {
  // read-excel-file's Node reader pulls in `unzipper`, which has an optional,
  // unused-in-our-case dependency on @aws-sdk/client-s3 that webpack otherwise
  // tries (and fails) to statically resolve. Treating it as external avoids
  // bundling it and just uses Node's require() at runtime instead.
  serverExternalPackages: ["read-excel-file"],
  // Ensure data/netsuite-inventory.xlsx (read at runtime via fs, not imported)
  // gets bundled into the serverless function on Vercel.
  outputFileTracingIncludes: {
    "/": ["./data/**"],
  },
};

module.exports = nextConfig;
