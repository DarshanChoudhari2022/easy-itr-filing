---
description: Complete crypto tax calculation platform development plan (Koinx-like)
---

# Crypto Tax Calculation Platform - Development Plan

## Quick Reference

### Key Tax Rules (India)
- **Capital Gains:** 30% flat rate (no STCG/LTCG distinction)
- **TDS:** 1% on all crypto transfers above threshold (Section 194S)
- **No loss set-off allowed**
- **No deduction of expenses** (except acquisition cost)
- **Staking/Mining income:** Taxed as per slab rate

### Priority Features
1. Exchange Integration (CSV + API)
2. FIFO/LIFO/HIFO Calculation Engine
3. Schedule VDA Report Generation
4. Portfolio Dashboard
5. ITR Auto-fill

### Supported Exchanges (Phase 1)
- WazirX, CoinDCX, Mudrex, Bitbns, ZebPay, CoinSwitch
- Binance, Coinbase, Kraken, KuCoin, Bybit

### File Locations
- **Crypto Engine:** `src/lib/crypto-engine.ts`
- **Crypto Service:** `src/lib/crypto-service.ts`
- **Crypto Page:** `src/pages/Crypto.tsx`
- **Database Schema:** `supabase/schema_advanced.sql`

### Development Commands
// turbo-all
```bash
npm run dev        # Start dev server
npm run build      # Build for production
npx tsc --noEmit   # Type check
```

## Implementation Checklist

### Phase 1: MVP (Current)
- [x] Basic CSV import (WazirX, CoinDCX, Binance)
- [x] FIFO calculation engine
- [x] Manual trade entry
- [x] Delete trades
- [x] Tax @ 30% calculation
- [x] TDS tracking
- [x] Schedule VDA CSV report
- [x] Beginner onboarding guide

### Phase 2: Enhancement
- [ ] Exchange API integration (OAuth)
- [ ] Blockchain address import
- [ ] LIFO, HIFO, ACB methods
- [ ] Tax loss harvesting suggestions
- [ ] Advanced portfolio analytics
- [ ] PDF report generation
- [ ] Email reports

### Phase 3: Scale
- [ ] DeFi protocol support
- [ ] NFT transactions
- [ ] Multi-year portfolio
- [ ] CA assignment workflow
- [ ] ITR auto-fill integration

## Database Schema

```sql
-- Core tables needed
crypto_trades (id, user_id, token_symbol, trade_type, quantity, buy_price, sell_price, trade_date, exchange, assessment_year, tds_paid, metadata)
crypto_inventory_lots (id, user_id, token, quantity, cost_basis, acquisition_date, source_tx)
crypto_integrations (id, user_id, platform, api_key_encrypted, status, last_sync)
audit_logs (id, user_id, action, entity_type, entity_id, old_value, new_value, timestamp)
```

## API Integrations

### CoinDCX API
- Docs: https://coindcx.com/api-documentation
- Endpoints: /exchange/v1/orders/trade_history, /exchange/v1/users/balances

### WazirX API  
- Docs: https://docs.wazirx.com/
- Endpoints: /sapi/v1/myTrades, /sapi/v1/funds

### Binance API
- Docs: https://binance-docs.github.io/apidocs/
- Endpoints: /api/v3/myTrades, /api/v3/account
