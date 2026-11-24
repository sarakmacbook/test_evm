/* Vercel serverless proxy for DeBank's Pro OpenAPI.
 * Keep DEBANK_ACCESS_KEY in Vercel environment variables; never expose it to the browser.
 */
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const MAX_TRACKED_IPS = 1000;
const CHAIN_IDS = ["eth", "bsc", "matic", "arb", "op", "base", "avax", "xdai", "linea", "scr", "era", "mantle", "celo", "sonic", "blast"];
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

  const accessKey = process.env.DEBANK_ACCESS_KEY;
  if (!accessKey) {
    return res.status(503).json({ error: "DeBank API is not configured." });
  }

  const forwardedFor = String(req.headers["x-forwarded-for"] || "");
  const ip = forwardedFor.split(",")[0].trim() || "unknown";
  if (!allowRequest(ip)) {
    return res.status(429).json({ error: "Too many requests. Try again shortly." });
  }

  const url = new URL("https://pro-openapi.debank.com/v1/user/all_token_list");
  url.searchParams.set("id", address);
  url.searchParams.set("is_all", "true");
  url.searchParams.set("chain_ids", CHAIN_IDS.join(","));

  try {
    const upstream = await fetch(url, {
      headers: { Accept: "application/json", AccessKey: accessKey },
      signal: AbortSignal.timeout(12_000),
    });
    if (!upstream.ok) {
      // Avoid returning upstream details or credentials to the browser.
      return res.status(upstream.status === 429 ? 429 : 502).json({ error: "DeBank could not complete this scan." });
    }

    const tokens = await upstream.json();
    if (!Array.isArray(tokens)) {
      return res.status(502).json({ error: "DeBank returned an unexpected response." });
    }
    return res.status(200).json({ tokens });
  } catch {
    return res.status(502).json({ error: "DeBank is temporarily unavailable." });
  }
};
