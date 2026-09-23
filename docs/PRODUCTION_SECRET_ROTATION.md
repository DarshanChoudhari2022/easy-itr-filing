# Production Secret Rotation Checklist

Use this checklist after any real credential is pasted into chat, logs, screenshots, support tickets, or a local file outside the intended secret store.

## Supabase

1. Open the Supabase project dashboard.
2. Rotate the database password from Project Settings -> Database.
3. Rotate exposed API keys from Project Settings -> API when available.
4. Update deployment secrets only in the hosting provider environment variables.
5. Update local `.env` manually on trusted machines only.
6. Confirm Row Level Security is enabled for user-owned tables.
7. Confirm service-role keys are never stored in frontend `VITE_` variables.

## CoinDCX

1. Revoke the old API key.
2. Create a new read-only key.
3. Do not enable trading, transfer, or withdrawal permissions.
4. Add the new key inside the app only when running over trusted HTTPS or local development.
5. Verify the app can fetch balances/history and that trading endpoints remain blocked by `/api/coindcx-proxy`.

## Repository Checks

Run these before pushing production code:

```bash
rg "postgresql://|sb_publishable|service_role|apiSecret|api_secret|password|eyJhbGci|YOUR-PASSWORD" -n . -g "!node_modules" -g "!dist"
npm run lint
npm test
npm run build
```

Expected result: no real secret values in source-controlled files, lint exits with zero errors, tests pass, and production build succeeds.
