# EVM Asset Radar

Lightweight website that **detects native-token and ERC-20 balances for an EVM address across 15 networks**. It uses OKX's address-level balance API when configured, then falls back to DeBank and public explorers. Results still provide DeBank profile links.

The browser has no build dependencies. Vercel serverless functions sign provider requests and keep all API credentials server-side.

## Features

- Paste any `0x…` address → scan 15 EVM networks (Ethereum, BNB Chain, Polygon, Arbitrum, Optimism, Base, Avalanche, Gnosis, Linea, Scroll, zkSync Era, Mantle, Celo, Sonic, Blast)
- OKX is the preferred source; DeBank and Blockscout/RPC are fallbacks
- Shows positive native/token balances with USD estimates where prices are available; OKX-flagged risk airdrops are filtered
- **DeBank handoff**: overall profile link + per-chain link (`debank.com/profile/{address}?chain=…`) on every result
- Shareable links: `?address=0x…` auto-scans on load
- Filters: only-active chains, hide dust (< $0.01), token search

## How detection works

On Vercel, the browser requests the same-origin `/api/okx` function. It signs a read-only request to OKX's `GET /api/v5/wallet/asset/all-token-balances-by-address` endpoint for the configured 15 EVM chain IDs. OKX documents address-based balance lookup for native and ERC-20 assets, with token price and risk flags in its response ([OKX API reference](https://web3.okx.com/build/docs/waas/walletapi-api-all-token-balances-by-address)).

If OKX is not configured or unavailable, the app tries the existing DeBank API proxy, then public Blockscout APIs and public-RPC native balance fallback.

### Configure OKX on Vercel

In **Vercel → Project Settings → Environment Variables**, add these four values for Production and Preview, then redeploy:

- `OKX_PROJECT_ID`
- `OKX_API_KEY`
- `OKX_API_SECRET`
- `OKX_API_PASSPHRASE`

Create these credentials in the OKX developer portal. Never place them in HTML, `app.js`, or chat. The proxy has basic per-instance throttling; for a public launch, consider Vercel Firewall/rate-limit protection.

### Optional DeBank fallback

Set `DEBANK_ACCESS_KEY` in Vercel to enable DeBank as the secondary provider. Its key is also kept server-side. See the [DeBank API reference](https://docs.cloud.debank.com/en/readme/api-pro-reference/user).

## Deploy to Vercel

This is a lightweight static frontend plus two Vercel serverless functions. Import the repository in Vercel and use:

- **Framework preset:** Other
- **Build command:** leave empty
- **Output directory:** `.` (repository root)
- **Install command:** leave empty
- Set the OKX environment variables above to enable primary OKX scanning; optional DeBank fallback can be enabled with `DEBANK_ACCESS_KEY`.

The included `vercel.json` enables clean URLs and disables trailing slashes. Vercel serves the frontend assets and deploys `api/okx.js` and `api/debank.js` as Node.js functions.

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
| `api/okx.js` | Signed OKX address-balance proxy; keeps credentials off the client |
| `api/debank.js` | Optional DeBank fallback proxy; keeps its AccessKey off the client |

Total size is a few tens of KB with zero dependencies.

## Notes & limitations

- USD values are provider estimates; unpriced tokens show `—`.
- NFTs, DeFi positions, and non-EVM chains are **not** shown here — use the Debank link for the complete portfolio.
- This tool never custodies funds or signs transactions. Debank is a third-party service.
