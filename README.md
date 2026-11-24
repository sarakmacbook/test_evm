# EVM Asset Radar

Lightweight, dependency-free website that **detects real assets (native coin + ERC-20 tokens) for any EVM address across 15 chains**, then redirects you to **Debank** for the full portfolio.

Runs entirely in the browser — no build step, no API key, no backend.

## Features

- Paste any `0x…` address → scans **15 EVM chains in parallel** (Ethereum, BNB Chain, Polygon, Arbitrum, Optimism, Base, Avalanche, Gnosis, Linea, Scroll, zkSync Era, Mantle, Celo, Sonic, Blast)
- Shows only **real balances** (balance > 0), with USD estimates where the explorer provides a price
- **Debank handoff**: overall profile link + per-chain link (`debank.com/profile/{address}?chain=…`) on every result
- Shareable links: `?address=0x…` auto-scans on load
- Filters: only-active chains, hide dust (< $0.01), token search
- Graceful degradation: a down explorer never blocks other chains; public-RPC fallback for native balances

## How detection works

For each chain, the browser calls the public Blockscout API (no key required, CORS-enabled):

```
GET {explorer}/api/v2/addresses/{address}/token-balances   → ERC-20 balances
GET {explorer}/api/v2/addresses/{address}                  → native coin balance + price
```

If Blockscout is unreachable, it falls back to `eth_getBalance` via a public RPC (e.g. LlamaRPC). Tokens with zero balance are dropped.

## Deploy to Vercel

This is a static site with no dependencies or build step. Import this Git repository in Vercel and use:

- **Framework preset:** Other
- **Build command:** leave empty
- **Output directory:** `.` (repository root)
- **Install command:** leave empty

The included `vercel.json` enables clean URLs and disables trailing slashes. Vercel will serve `index.html`, `styles.css`, and `app.js` directly.

## Run locally

Any static server works:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Or just open `index.html` in a browser (note: `fetch` to the explorers requires the page to be served over http(s) in some browsers — a local server is recommended).

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure |
| `styles.css` | Dark theme, responsive layout |
| `app.js` | Chain registry, scanning, rendering, Debank links |

Total size is a few tens of KB with zero dependencies.

## Notes & limitations

- USD values are estimates from each explorer's exchange rate; unpriced tokens show `—`.
- NFTs, DeFi positions, and non-EVM chains are **not** shown here — use the Debank link for the complete portfolio.
- This tool never custodies funds or signs transactions. Debank is a third-party service.
