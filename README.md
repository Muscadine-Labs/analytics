# Muscadine Analytics

Next.js dashboard for Muscadine vaults on Morpho. 

## Quick Start

```bash
npm install
cp .env.example .env.local   # optional — see env table below
npm run dev
```

Open http://localhost:3000

## Environment Variables

Copy `.env.example` → `.env.local`. Set `ALCHEMY_API_KEY` for oracle freshness, IRM utilization, and timelock reads. Morpho GraphQL needs no key.

Requires **Node.js 24+** (Active LTS).

| Variable | Required? | Purpose |
|----------|-----------|---------|
| `ALCHEMY_API_KEY` | Recommended | Default Base RPC for oracles, utilization/IRM, and timelocks |
| `COINBASE_CDP_API_KEY` | No | Alternative server RPC |
| `MORPHO_API_URL` | No | Morpho GraphQL override |
| `NEXT_PUBLIC_VAULT_*` | No | Vault address overrides |

## Scripts

- `npm run dev` – Development
- `npm run build` – Production build
- `npm run lint` – Lint
- `npm test` – Tests

## License

MIT. See [LICENSE](LICENSE).
