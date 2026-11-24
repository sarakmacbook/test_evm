/* Vercel serverless proxy for OKX's address-level total-token-balances API.
 * Store all OKX credentials as Vercel environment variables; never expose them client-side.
 */
const { createHmac } = require("node:crypto");

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const CHAIN_IDS = ["1", "56", "137", "42161", "10", "8453", "43114", "100", "59144", "534352", "324", "5000", "42220", "146", "81457"];
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const MAX_TRACKED_IPS = 1000;
const requestsByIp = new Map();

function allowRequest(ip, now = Date.now()) {
  if (requestsByIp.size > MAX_TRACKED_IPS) {
    for (const [key, value] of requestsByIp) {
      if (now - value.start >= WINDOW_MS) requestsByIp.delete(key);
    }
  }
  const entry = requestsByIp.get(ip);
  if (!entry || now - entry.start >= WINDOW_MS) {
    requestsByIp.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_REQUESTS_PER_WINDOW;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, max-age=30");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const address = String(req.query?.address || "");
  if (!ADDRESS_RE.test(address)) {
    return res.status(400).json({ error: "A valid EVM address is required." });
  }

  const credentials = {
    project: process.env.OKX_PROJECT_ID,
    key: process.env.OKX_API_KEY,
    secret: process.env.OKX_API_SECRET,
    passphrase: process.env.OKX_API_PASSPHRASE,
  };
  if (Object.values(credentials).some((value) => !value)) {
    return res.status(503).json({ error: "OKX API is not configured." });
  }

  const forwardedFor = String(req.headers["x-forwarded-for"] || "");
  const ip = forwardedFor.split(",")[0].trim() || "unknown";
  if (!allowRequest(ip)) {
    return res.status(429).json({ error: "Too many requests. Try again shortly." });
  }

  const params = new URLSearchParams({ address, chains: CHAIN_IDS.join(","), filter: "0" });
  const path = `/api/v5/wallet/asset/all-token-balances-by-address?${params.toString()}`;
  const timestamp = new Date().toISOString();
  const signature = createHmac("sha256", credentials.secret)
    .update(`${timestamp}GET${path}`)
    .digest("base64");

  try {
    const upstream = await fetch(`https://www.okx.com${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "OK-ACCESS-PROJECT": credentials.project,
        "OK-ACCESS-KEY": credentials.key,
        "OK-ACCESS-SIGN": signature,
        "OK-ACCESS-PASSPHRASE": credentials.passphrase,
        "OK-ACCESS-TIMESTAMP": timestamp,
      },
      signal: AbortSignal.timeout(12_000),
    });

    if (!upstream.ok) {
      return res.status(upstream.status === 429 ? 429 : 502).json({ error: "OKX could not complete this scan." });
    }
    const payload = await upstream.json();
    if (String(payload.code) !== "0" || !Array.isArray(payload.data)) {
      return res.status(502).json({ error: "OKX returned an unexpected response." });
    }
    const tokens = payload.data.flatMap((wallet) => Array.isArray(wallet.tokenAssets) ? wallet.tokenAssets : []);
    return res.status(200).json({ tokens });
  } catch {
    return res.status(502).json({ error: "OKX is temporarily unavailable." });
  }
};
