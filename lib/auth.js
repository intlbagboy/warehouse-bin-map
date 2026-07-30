// Signed-cookie auth helpers, shared by middleware.js and the /api/login route.
// Uses Web Crypto (available in both the Edge middleware runtime and Node 20+),
// so no extra dependencies are needed.

export const COOKIE_NAME = "wh_auth";

async function hmac(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(sigBuffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export async function createToken(username, secret, ttlMs = 1000 * 60 * 60 * 24 * 30) {
  const payload = { u: username, exp: Date.now() + ttlMs };
  const payloadB64 = btoa(JSON.stringify(payload));
  const sig = await hmac(secret, payloadB64);
  return `${payloadB64}.${sig}`;
}

export async function verifyToken(token, secret) {
  if (!token) return false;
  const dotIndex = token.lastIndexOf(".");
  if (dotIndex === -1) return false;
  const payloadB64 = token.slice(0, dotIndex);
  const sig = token.slice(dotIndex + 1);
  const expectedSig = await hmac(secret, payloadB64);
  if (sig !== expectedSig) return false;
  try {
    const payload = JSON.parse(atob(payloadB64));
    if (payload.exp && Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}
