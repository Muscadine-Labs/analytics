# Muscadine Analytics

Next.js dashboard for Muscadine vaults on Morpho (Base). Live at [analytics.muscadine.xyz](https://analytics.muscadine.xyz).

## Quick Start

```bash
npm install
cp .env.example .env.local   # optional — see env table below
npm run dev
```

Open http://localhost:3000

## Environment Variables

Copy `.env.example` → `.env.local`. No variables are strictly required (demo RPC works locally).

| Variable | Required? | Purpose |
|----------|-----------|---------|
| `ALCHEMY_API_KEY` | No (recommended) | Server-side Base RPC |
| `NEXT_PUBLIC_ALCHEMY_API_KEY` | No (recommended) | Client-side Base RPC |
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
