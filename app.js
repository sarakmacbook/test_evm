/* EVM Asset Radar — dependency-free, browser-only.
   Detects real native + ERC-20 balances across EVM chains via public
   Blockscout APIs (no key), with public-RPC fallback for native coins.
   Every result deep-links to Debank. */
"use strict";

/* ---------- Chain registry ---------- */
const CHAINS = [
  { id:"ethereum",  name:"Ethereum",        symbol:"ETH",  chainId:1,      color:"#627eea", debank:"eth",    api:"https://eth.blockscout.com",       explorer:"https://eth.blockscout.com",       rpc:"https://eth.llamarpc.com" },
  { id:"bsc",       name:"BNB Chain",       symbol:"BNB",  chainId:56,     color:"#f0b90b", debank:"bsc",    api:"https://bsc.blockscout.com",       explorer:"https://bsc.blockscout.com",       rpc:"https://bsc.llamarpc.com" },
  { id:"polygon",   name:"Polygon",         symbol:"MATIC",chainId:137,    color:"#8247e5", debank:"matic",  api:"https://polygon.blockscout.com",   explorer:"https://polygon.blockscout.com",   rpc:"https://polygon.llamarpc.com" },
  { id:"arbitrum",  name:"Arbitrum One",    symbol:"ARB",  chainId:42161,  color:"#28a0f0", debank:"arb",    api:"https://arb.blockscout.com",       explorer:"https://arb.blockscout.com",       rpc:"https://arb1.llamarpc.com" },
  { id:"optimism",  name:"Optimism",        symbol:"OP",   chainId:10,     color:"#ff0420", debank:"op",     api:"https://optimism.blockscout.com",  explorer:"https://optimism.blockscout.com",  rpc:"https://optimism.llamarpc.com" },
  { id:"base",      name:"Base",            symbol:"ETH",  chainId:8453,   color:"#0052ff", debank:"base",   api:"https://base.blockscout.com",      explorer:"https://base.blockscout.com",      rpc:"https://base.llamarpc.com" },
  { id:"avalanche", name:"Avalanche C-Chain",symbol:"AVAX",chainId:43114,  color:"#e84142", debank:"avax",   api:"https://avalanche.blockscout.com", explorer:"https://avalanche.blockscout.com", rpc:"https://avalanche-c-chain-rpc.publicnode.com" },
  { id:"gnosis",    name:"Gnosis",          symbol:"xDAI", chainId:100,    color:"#047857", debank:"gno",    api:"https://gnosis.blockscout.com",    explorer:"https://gnosis.blockscout.com",    rpc:"https://rpc.gnosischain.com" },
  { id:"linea",     name:"Linea",           symbol:"ETH",  chainId:59144,  color:"#61d7f4", debank:"linea",  api:"https://linea.blockscout.com",     explorer:"https://linea.blockscout.com",     rpc:"https://rpc.linea.build" },
  { id:"scroll",    name:"Scroll",          symbol:"ETH",  chainId:534352, color:"#ffeeda", debank:"scroll", api:"https://scroll.blockscout.com",    explorer:"https://scroll.blockscout.com",    rpc:"https://rpc.scroll.io" },
  { id:"zksync",    name:"zkSync Era",      symbol:"ETH",  chainId:324,    color:"#4c82fb", debank:"zksync", api:"https://zksync.blockscout.com",    explorer:"https://zksync.blockscout.com",    rpc:"https://mainnet.era.zksync.io" },
  { id:"mantle",    name:"Mantle",          symbol:"MNT",  chainId:5000,   color:"#7dd3c0", debank:"mantle", api:"https://mantle.blockscout.com",    explorer:"https://mantle.blockscout.com",    rpc:"https://rpc.mantle.xyz" },
  { id:"celo",      name:"Celo",            symbol:"CELO", chainId:42220,  color:"#fcff52", debank:"celo",   api:"https://celo.blockscout.com",      explorer:"https://celo.blockscout.com",      rpc:"https://forno.celo.org" },
  { id:"sonic",     name:"Sonic",           symbol:"S",    chainId:146,    color:"#f9a8d4", debank:"sonic",  api:"https://sonic.blockscout.com",     explorer:"https://sonic.blockscout.com",     rpc:"https://rpc.soniclabs.com" },
  { id:"blast",     name:"Blast",           symbol:"ETH",  chainId:81457,  color:"#facc15", debank:"blast",  api:"https://blast.blockscout.com",     explorer:"https://blast.blockscout.com",     rpc:"https://rpc.blast.io" },
];

const TIMEOUT_MS = 9000;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/* ---------- DOM ---------- */
const $ = (s) => document.querySelector(s);
const form = $("#scanForm"), input = $("#addressInput"), scanBtn = $("#scanBtn");
const formError = $("#formError"), pasteBtn = $("#pasteBtn");
const resultsEl = $("#results"), chainGrid = $("#chainGrid");
const progressFill = $("#progressFill"), progressText = $("#progressText");
const sumChains = $("#sumChains"), sumTokens = $("#sumTokens"), sumUsd = $("#sumUsd");
const resultAddress = $("#resultAddress");
const onlyActive = $("#onlyActive"), hideDust = $("#hideDust"), tokenSearch = $("#tokenSearch");
const emptyState = $("#emptyState");

/* ---------- Helpers ---------- */
function debankUrl(address, chain) {
  const base = `https://debank.com/profile/${address}`;
  return chain ? `${base}?chain=${chain.debank}` : base;
}
function shortAddr(a) { return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : ""; }
function fmtUsd(n) {
  if (!isFinite(n) || n == null) return "—";
  if (n === 0) return "$0.00";
  if (n < 0.01) return "<$0.01";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}
/* Exact decimal from smallest-unit string + decimals (avoids float drift). */
function toHuman(valueStr, decimals) {
  if (valueStr == null || valueStr === "") return 0;
  try {
    const v = BigInt(String(valueStr));
    const d = Number(decimals || 0);
    if (d === 0) return Number(v);
    const s = v.toString().padStart(d + 1, "0");
    const int = s.slice(0, -d) || "0";
    const frac = s.slice(-d).replace(/0+$/, "");
    return Number(frac ? `${int}.${frac}` : int);
  } catch { return Number(valueStr) || 0; }
}
function fmtAmount(n) {
  if (!isFinite(n)) return "0";
  if (n === 0) return "0";
  if (Math.abs(n) < 0.000001) return n.toExponential(2);
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}
async function fetchJson(url, timeoutMs = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}
async function rpcNativeBalance(rpcUrl, address) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(rpcUrl, {
      method: "POST", signal: ctrl.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
    });
    const json = await res.json();
    if (json && json.result) return toHuman(BigInt(json.result).toString(), 18);
    return null;
  } catch { return null; }
  finally { clearTimeout(t); }
}
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

/* ---------- Per-chain scan ---------- */
async function scanChain(chain, address) {
  const [tokensRes, addrRes] = await Promise.allSettled([
    fetchJson(`${chain.api}/api/v2/addresses/${address}/token-balances`),
    fetchJson(`${chain.api}/api/v2/addresses/${address}`),
  ]);

  let native = null, nativeUsd = 0, tokens = [], error = null;

  if (addrRes.status === "fulfilled" && addrRes.value) {
    const a = addrRes.value;
    if (a.coin_balance != null) {
      native = toHuman(a.coin_balance, 18);
      const rate = Number(a.exchange_rate || 0);
      if (rate > 0) nativeUsd = native * rate;
    }
  }
  if (tokensRes.status === "fulfilled" && Array.isArray(tokensRes.value)) {
    tokens = tokensRes.value
      .map((item) => {
        const tok = item.token || {};
        const decimals = tok.decimals ?? 0;
        const bal = toHuman(item.value ?? "0", decimals);
        const rate = Number(tok.exchange_rate || item.fiat_value_rate || 0);
        const usd = rate > 0 ? bal * rate : (item.fiat_value != null ? Number(item.fiat_value) : 0);
        return {
          symbol: tok.symbol || "?", name: tok.name || tok.symbol || "Unknown token",
          address: tok.address_hash || tok.address || "", decimals, balance: bal, usd,
          type: tok.type || "ERC-20", tokenId: item.token_id ?? null,
        };
      })
      .filter((t) => t.balance > 0)
      .sort((x, y) => y.usd - x.usd);
  }

  /* RPC fallback: if Blockscout gave us nothing, at least try native via RPC. */
  if (native == null && chain.rpc) {
    native = await rpcNativeBalance(chain.rpc, address);
  }
  if (native == null && tokens.length === 0) {
    error = tokensRes.status === "rejected" && addrRes.status === "rejected"
      ? "Explorer unreachable" : null;
  }
  const totalUsd = (nativeUsd || 0) + tokens.reduce((s, t) => s + (t.usd || 0), 0);
  const hasAssets = (native != null && native > 0) || tokens.length > 0;
  return { chain, native, nativeUsd, tokens, totalUsd, hasAssets, error };
}

/* ---------- Rendering ---------- */
function chainCardHtml(r, address, filter) {
  const { chain, native, nativeUsd, tokens, totalUsd, hasAssets, error } = r;
  const q = (filter || "").toLowerCase();
  const visibleTokens = tokens.filter((t) =>
    (!hideDust.checked || t.usd >= 0.01) &&
    (!q || t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
  );
  const tokenRows = visibleTokens.map((t) => `
    <div class="token-row">
      <div class="token-left">
        <span class="token-sym">${esc(t.symbol)}</span>
        <span class="token-name" title="${esc(t.name)}">${esc(t.name)}</span>
        ${t.address ? `<div class="token-addr mono">${shortAddr(t.address)}</div>` : ""}
      </div>
      <div class="token-right">
        <div class="token-bal">${fmtAmount(t.balance)}</div>
        <div class="token-usd">${t.usd > 0 ? fmtUsd(t.usd) : "—"}</div>
      </div>
    </div>`).join("");

  const nativeRow = (native != null && native > 0) ? `
    <div class="token-row">
      <div class="token-left"><span class="token-sym">${esc(chain.symbol)}</span> <span class="token-name">Native coin</span></div>
      <div class="token-right"><div class="token-bal">${fmtAmount(native)}</div><div class="token-usd">${nativeUsd > 0 ? fmtUsd(nativeUsd) : "—"}</div></div>
    </div>` : "";

  const body = hasAssets
    ? (nativeRow + tokenRows || `<div class="chain-status">No tokens match the current filter.</div>`)
    : error
      ? `<div class="chain-error">⚠ ${esc(error)} — balances may be missing on this chain.</div>`
      : `<div class="chain-status">No balance on this chain.</div>`;

  return `
  <article class="chain-card ${hasAssets ? "" : "is-empty"}" data-chain="${chain.id}">
    <div class="chain-head">
      <div class="chain-title">
        <span class="chain-dot" style="background:${chain.color}"></span>
        <div><strong>${esc(chain.name)}</strong><small>Chain ID ${chain.chainId} · ${esc(chain.symbol)}</small></div>
      </div>
      <div class="chain-usd">${hasAssets ? fmtUsd(totalUsd) : "—"}<small>est. value</small></div>
    </div>
    ${body}
    <div class="chain-links">
      <a class="debank" href="${debankUrl(address, chain)}" target="_blank" rel="noopener noreferrer">Debank (this chain) ↗</a>
      <a href="${chain.explorer}/address/${address}" target="_blank" rel="noopener noreferrer">Explorer ↗</a>
    </div>
  </article>`;
}

let scanResults = [];
let currentAddress = "";

function renderResults() {
  const q = tokenSearch.value;
  const sorted = [...scanResults].sort((a, b) => b.totalUsd - a.totalUsd);
  const visible = onlyActive.checked ? sorted.filter((r) => r.hasAssets) : sorted;
  chainGrid.innerHTML = visible.map((r) => chainCardHtml(r, currentAddress, q)).join("");

  const active = scanResults.filter((r) => r.hasAssets);
  const tokenCount = active.reduce((s, r) => s + r.tokens.length, 0);
  const totalUsd = active.reduce((s, r) => s + r.totalUsd, 0);
  sumChains.textContent = String(active.length);
  sumTokens.textContent = String(tokenCount);
  sumUsd.textContent = fmtUsd(totalUsd);
  emptyState.hidden = !(scanResults.length && active.length === 0);
}

function updateProgress(done, total) {
  progressFill.style.width = total ? `${Math.round((done / total) * 100)}%` : "0%";
  progressText.textContent = done >= total ? `Done — ${total} chains scanned.` : `Scanning… ${done}/${total} chains`;
}

/* ---------- Scan orchestration ---------- */
async function runScan(address) {
  currentAddress = address;
  scanResults = [];
  resultsEl.hidden = false;
  resultAddress.textContent = address;
  $("#debankMainBtn").href = debankUrl(address);
  $("#debankSummaryLink").href = debankUrl(address);
  $("#debankEmptyBtn").href = debankUrl(address);
  $("#navDebank").href = debankUrl(address);
  chainGrid.innerHTML = CHAINS.map((c) => `
    <article class="chain-card" data-chain="${c.id}">
      <div class="chain-title"><span class="chain-dot" style="background:${c.color}"></span>
      <div><strong>${esc(c.name)}</strong><small>Chain ID ${c.chainId}</small></div></div>
      <div class="chain-status"><span class="spinner"></span> Scanning…</div>
    </article>`).join("");
  updateProgress(0, CHAINS.length);
  resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });

  let done = 0;
  await Promise.all(CHAINS.map(async (chain) => {
    try {
      const r = await scanChain(chain, address);
      scanResults.push(r);
      const card = chainGrid.querySelector(`[data-chain="${chain.id}"]`);
      if (card) {
        const tmp = document.createElement("div");
        tmp.innerHTML = chainCardHtml(r, address, tokenSearch.value);
        card.replaceWith(tmp.firstElementChild);
      }
    } catch (e) {
      scanResults.push({ chain, native: null, nativeUsd: 0, tokens: [], totalUsd: 0, hasAssets: false, error: "Scan failed" });
    } finally {
      done++; updateProgress(done, CHAINS.length); renderResults();
    }
  }));
  renderResults();
}

/* ---------- Events ---------- */
function setError(msg) {
  formError.textContent = msg || "";
  formError.hidden = !msg;
}
function validateAndScan(raw) {
  const address = (raw || "").trim();
  if (!ADDRESS_RE.test(address)) {
    setError("Enter a valid EVM address: 0x followed by 40 hex characters.");
    input.focus(); return;
  }
  setError("");
  history.replaceState(null, "", `?address=${address}`);
  runScan(address);
}
form.addEventListener("submit", (e) => { e.preventDefault(); validateAndScan(input.value); });
pasteBtn.addEventListener("click", async () => {
  try { input.value = await navigator.clipboard.readText(); input.focus(); }
  catch { setError("Clipboard access denied — paste manually (Ctrl/Cmd+V)."); }
});
document.querySelectorAll("[data-sample]").forEach((b) =>
  b.addEventListener("click", () => { input.value = b.dataset.sample; validateAndScan(b.dataset.sample); })
);
[onlyActive, hideDust].forEach((el) => el.addEventListener("change", renderResults));
tokenSearch.addEventListener("input", renderResults);
$("#copyAddressBtn").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(currentAddress); $("#copyAddressBtn").textContent = "Copied ✓"; setTimeout(() => $("#copyAddressBtn").textContent = "Copy address", 1500); } catch {}
});
$("#copyLinkBtn").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(location.origin + location.pathname + `?address=${currentAddress}`); $("#copyLinkBtn").textContent = "Link copied ✓"; setTimeout(() => $("#copyLinkBtn").textContent = "Copy share link", 1500); } catch {}
});

/* ---------- Static chain list + deep link ---------- */
$("#chainList").innerHTML = CHAINS.map((c) => `
  <div class="chain-pill"><span class="chain-dot" style="background:${c.color}"></span>
  <div><strong>${esc(c.name)}</strong><small>${esc(c.symbol)} · ID ${c.chainId}</small></div></div>`).join("");

/* Auto-scan from ?address=0x… (shareable links). */
const params = new URLSearchParams(location.search);
const initial = params.get("address");
if (initial && ADDRESS_RE.test(initial)) { input.value = initial; validateAndScan(initial); }
