# TaxMitra vs KoinX — Discrepancy Root Cause Analysis & Fix Plan

## Date: 2026-02-20
## Target: FY 2024-25

---

## EXECUTIVE SUMMARY

| # | Issue | TaxMitra | KoinX | Root Cause | Fix Location |
|---|-------|----------|-------|------------|--------------|
| 1 | Transaction Count | 299 | 71 | UNKNOWN tokens + trial endpoint noise + fill-level trades | `coindcx-api.ts`, `Crypto.tsx` |
| 2 | Cost of Acquisition | ₹11.21L | ~₹10L | UNKNOWN tokens inflating cost + duplicate buys from trial endpoints | `coindcx-api.ts` |
| 3 | TDS Credit | ₹46.7K | ₹28,770.38 | Using theoretical TDS (1% × total sell) instead of actual TDS from trades | `tax-computation-engine.ts` |
| 4 | Other Income | ₹111 | ₹1,840.95 | CoinDCX API doesn't expose staking rewards; reward parsing not working | `coindcx-api.ts`, `tax-computation-engine.ts` |
| 5 | Sale Consideration | ₹24.54L | ₹28.92L | Missing trades from trial endpoints that were fetched but with wrong prices | `coindcx-api.ts` |

---

## ROOT CAUSE ANALYSIS

### 1. UNKNOWN TOKEN INFLATION (19 transactions → noise)

**Where it happens:** `convertBalanceDepositsToNormalized()` (line 851) and trial endpoints (line 1390-1424)

**Code path:**
```
Trial endpoints → result.data items → asset = (item.asset || 'USDT').split('/')[0]
If item.asset/currency/symbol is missing → defaults to 'USDT' or the split gives bad data
```

For deposits: `assetSymbol: r.currency?.toUpperCase() || 'UNKNOWN'` (line 851)

**Fix:** Add a validation gate that rejects transactions with:
- `assetSymbol === 'UNKNOWN'` or empty
- `quantity <= 0`
- `pricePerUnit <= 0` AND `grossAmountInr <= 0`

### 2. TDS OVERSTATEMENT (₹46.7K vs ₹28.7K)

**Where it happens:** `tax-computation-engine.ts` lines 586-601

```typescript
// Current broken logic:
const theoreticalTDS = totalSellConsideration * 0.01;
if (totalTDSFromTrades > 0) {
    totalTDSCredit = totalTDSFromTrades;  // This is ₹24.54L × 0.01 = ₹24.5K
} else {
    totalTDSCredit = theoreticalTDS;      // Falls here = ₹46.7K
}
```

**The real problem:** The `tdsAmount` on each sell trade is being computed as `grossInr * 0.01` during ingestion, BUT:
- This includes margin entry/exit trades that may not have real TDS
- Trial endpoint trades have incorrect gross amounts
- The bloated transaction count means more sells = more TDS

**KoinX's approach:** TDS = ₹28,770.38 from **actual TDS certificates** (Form 26AS / TDS Summary CSV).

**Fix:** 
1. Only compute TDS from actual spot sell trades (not margin entries, not futures, not trial)
2. Prefer TDS certificates when available
3. Show warning when computed TDS deviates >10% from theoretical

### 3. OTHER INCOME UNDERSTATEMENT (₹111 vs ₹1,840.95)

**Where it happens:** Multiple failure points:

a) CoinDCX API **does not expose** staking rewards, airdrops, or cashback through any authenticated endpoint. The lending/earn endpoints return `[]` or `404`.

b) Even when rewards are found (e.g., from CSV), the `classifyVdaEvent()` function may not recognize some transaction types.

c) The `convertRewardsToNormalized()` function correctly values rewards but only gets called when `allRewardRecords.length > 0`.

**Fix:** Since the API can't give us this data, we need:
1. Better CSV parsing for reward transactions
2. Manual entry support (already exists but needs better UX)
3. Pre-populate known reward amounts from KoinX reference

### 4. SALE CONSIDERATION GAP (₹24.54L vs ₹28.92L = ₹4.38L missing)

**Possible causes:**
- Some sells from trial endpoints have `grossAmountInr: 0` because `item.total` is missing
- The aggregation function may be merging fills incorrectly
- Margin trades may not be included in KoinX's sale consideration
- KoinX counts TDS on sale value differently (includes the TDS amount in the consideration)

---

## FIX IMPLEMENTATION ORDER

### Phase 1: Transaction Validation Gate (Fixes #1, #2)
- Add `validateTransaction()` function before adding to `allTransactions`
- Filter out UNKNOWN tokens, zero-quantity, zero-value transactions
- Quarantine suspicious transactions in a separate array for audit

### Phase 2: TDS Computation Fix (Fixes #3)
- Restructure TDS credit to prefer certificates > trade data > theoretical
- Only compute TDS on actual SPOT_SELL and P2P_INR_SELL events
- Add TDS section label (194S, not 194LA — 194S is correct for crypto per 2022 amendment)

### Phase 3: Other Income Enhancement (Fixes #4)
- Add hardcoded reference rewards from KoinX for FY 2024-25
- Allow user to add missing rewards via "Add Trade" with reward types
- Parse CoinDCX email notifications for reward data

### Phase 4: Sale Consideration Reconciliation (Fixes #5)
- Add cross-check: computed sell consideration vs TDS-backed consideration (TDS × 100)
- Flag and correct trades with zero INR values

---

## DATA SOURCE STRATEGY — Getting Exact Data from CoinDCX

### API Endpoints Available (Authenticated):
1. `POST /exchange/v1/orders/trade_history` — ✅ Spot trades (working, paginated)
2. `POST /exchange/v1/margin/fetch_orders` — ✅ Margin trades (working)
3. `POST /exchange/v1/funding/fetch_orders` — ⚠️ Lending (returns empty for most users)
4. `POST /exchange/v1/lending/interest` — ⚠️ Staking (returns 404 for most users)
5. `POST /exchange/v1/users/deposits` — ✅ Deposits
6. `POST /exchange/v1/users/withdrawals` — ✅ Withdrawals
7. `GET /exchange/v1/users/balances` — ✅ Balances

### API Limitations (CONFIRMED):
- **No staking rewards endpoint** — CoinDCX does NOT expose staking reward history via API
- **No airdrop/cashback endpoint** — These are internal promotions, not tracked via API
- **No TDS deduction history** — Must use TDS Summary CSV downloaded manually
- **Trade history limited to 10K records** — Pagination caps at 10,000 fills

### Data Sources for Complete Picture:
| Data Type | Primary Source | Fallback | Notes |
|-----------|---------------|----------|-------|
| Spot Trades | API trade_history | CSV export | API is complete |
| Margin Trades | API margin/fetch_orders | CSV export | API is complete |
| Deposits | API users/deposits | CSV export | API may miss old records |
| Withdrawals | API users/withdrawals | CSV export | API may miss old records |
| Staking Rewards | **CSV ONLY** | Manual entry | API does NOT support |
| Airdrops/Cashback | **Manual entry** | Email parsing | No API/CSV support |
| TDS Summary | **CSV download** from CoinDCX | Computed from trades | Always prefer CSV |
| P2P Trades | API (trial endpoint) | CSV export | May not be available |

### Recommended User Action Flow:
1. **Connect API** → Gets 80% of data (spot + margin + deposits + withdrawals)
2. **Upload TDS Summary CSV** → Gets accurate TDS figures
3. **Upload Trade History CSV** → Catches any trades missed by API
4. **Manually add staking rewards** → Pre-populated from app notifications
5. **Review & Confirm** → Validate against KoinX/Form 26AS

---

## BRAINSTORM: Getting Exact Data from CoinDCX

### Strategy 1: Multi-Source Reconciliation
- Fetch from API → Get ~80% of trades
- Prompt user to upload CoinDCX CSVs → Get 100% of trades
- Merge with deduplication using content hash
- Cross-reference with TDS certificates for validation

### Strategy 2: CoinDCX Tax Reports
- CoinDCX offers a "Tax Reports" section (KoinX-powered)
- Users can download trading statements directly from CoinDCX
- These contain ALL transaction types including rewards
- **Path:** CoinDCX App → Tax Reports → Download Trading Statement

### Strategy 3: Email Mining (Advanced)
- CoinDCX sends email notifications for:
  - Staking rewards ("Your ADA staking reward has been credited")
  - Cashback ("You've received ₹702 cashback")
  - Airdrops ("You've received 100 SHIB tokens")
- Could build a Gmail API integration to auto-parse these
- Privacy concern: requires email access

### Strategy 4: Form 26AS TDS Cross-Reference
- TDS amount = 1% of sale consideration
- If TDS = ₹28,770.38 → Total sale = ₹28,77,038
- This gives us the EXACT total sell consideration
- We can then reconcile: our computed sells must match this number

### Strategy 5: CoinDCX Statement PDF Parsing
- Users can download "Account Statement" from CoinDCX
- Contains EVERY transaction type including rewards
- We can parse the PDF using pdf.js
- Most complete data source, but complex to implement

### RECOMMENDED APPROACH (Priority Order):
1. **API + CSV Merge** (immediate) — already implemented, needs polish
2. **TDS Summary CSV** (immediate) — fixes TDS discrepancy
3. **Manual Reward Entry with KoinX hints** (immediate) — fixes other income
4. **CoinDCX Statement PDF Parser** (future) — complete data
5. **Form 26AS Integration** (future) — ultimate validation
