# EVM Asset Radar

Lightweight website that **detects real assets (native coin + ERC-20 tokens) for any EVM address across 15 EVM networks**, with **DeBank's portfolio API** as the preferred source and public explorer fallback. Results link to DeBank for the full portfolio.

The UI is browser-based and has no build dependencies. On Vercel, an optional serverless proxy keeps the DeBank API key server-side; without a configured key, the scanner falls back to public explorers.

## Features

- Paste any `0x…` address → uses DeBank's all-chain portfolio endpoint when configured; otherwise scans **15 EVM chains in parallel** (Ethereum, BNB Chain, Polygon, Arbitrum, Optimism, Base, Avalanche, Gnosis, Linea, Scroll, zkSync Era, Mantle, Celo, Sonic, Blast)
- Shows positive balances with USD estimates where the data provider has prices
- **DeBank handoff**: overall profile link + per-chain link (`debank.com/profile/{address}?chain=…`) on every result
- Shareable links: `?address=0x…` auto-scans on load
- Filters: only-active chains, hide dust (< $0.01), token search
- Graceful degradation: a down explorer never blocks other chains; public-RPC fallback for native balances

## How detection works

On Vercel with `DEBANK_ACCESS_KEY` configured, the browser calls the same-origin `/api/debank` function. The function calls DeBank's Pro OpenAPI `GET /v1/user/all_token_list?id=…&is_all=true` endpoint and returns indexed token balances/prices. The secret remains in the serverless function and is never sent to browser code. See the [DeBank API reference](https://docs.cloud.debank.com/en/readme/api-pro-reference/user).

If the DeBank proxy is not configured or unavailable, the browser falls back to public Blockscout APIs per chain (no key required), with `eth_getBalance` via public RPC as the native-balance fallback. Tokens with zero balance are dropped.

### Configure DeBank on Vercel

Add `DEBANK_ACCESS_KEY` as an environment variable in **Vercel → Project Settings → Environment Variables** for the Production and Preview environments, then redeploy. Do not put the key in `app.js`, HTML, or a `NEXT_PUBLIC_*` variable. The endpoint has basic per-instance throttling; for a public launch, consider adding Vercel Firewall/rate-limit protection to the function.

## Deploy to Vercel

This is a lightweight static frontend plus one Vercel serverless function. Import this Git repository in Vercel and use:

- **Framework preset:** Other
- **Build command:** leave empty
- **Output directory:** `.` (repository root)
- **Install command:** leave empty
- Optionally set `DEBANK_ACCESS_KEY` to enable DeBank API scanning; without it the public-explorer fallback remains available.

The included `vercel.json` enables clean URLs and disables trailing slashes. Vercel serves `index.html`, `styles.css`, and `app.js` directly and deploys `api/debank.js` as a Node.js function.

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
| `app.js` | Chain registry, scanning, rendering, DeBank links |
| `api/debank.js` | Vercel serverless proxy; keeps the DeBank AccessKey off the client |

Total size is a few tens of KB with zero dependencies.

## Notes & limitations

- USD values are provider estimates; unpriced tokens show `—`.
- NFTs, DeFi positions, and non-EVM chains are **not** shown here — use the Debank link for the complete portfolio.
- This tool never custodies funds or signs transactions. Debank is a third-party service.
