# Crypto Tax Engine — Complete Bug Audit & Fix Plan

## KoinX Reference Numbers (FY 2024-25)
- Capital Gains: ₹1.62L
- Derivatives Gains: ₹0.00
- Other Gains: ₹1,840.95
- Total Taxable Gains: ₹1.64L
- TDS Deducted: ₹28,770.38
- Total Sale Value: ₹28.92L

## TaxMitra Current Numbers (FY 2024-25)
- Net Gain/Loss: ₹17.6K (WRONG — should be ₹1.62L)
- Other Income: ₹0 (WRONG — should be ₹1,840.95)
- Brokerage Fees: ₹12.4K
- Tax Liability: ₹5.5K (WRONG — too low because gains are wrong)
- TDS Credit: ₹20.8K (WRONG — should be ₹28,770.38)

---

## Bug #1: FY Detection Does NOT Convert to IST (CRITICAL)
**Files:** `coindcx-api.ts:564`, `coindcx-ingestion.ts:157`
**Impact:** Transactions near midnight UTC (Mar 31 / Apr 1) may be assigned to the wrong FY.

**Current Code (coindcx-api.ts:564):**
```ts
function getFY(date: Date): string {
    const month = date.getMonth(); // Uses local TZ, not IST
    const year = date.getFullYear();
    if (month < 3) return `${year - 1}-${String(year).slice(2)}`;
    return `${year}-${String(year + 1).slice(2)}`;
}
```

**Problem:** Uses `date.getMonth()` which depends on the browser's local timezone. If the user's browser is in UTC, a trade at 2025-03-31T22:00UTC (which is 2025-04-01T03:30 IST) would incorrectly be classified as FY 2024-25 instead of FY 2025-26.

**Fix:** Always convert to IST (+5:30) before extracting month/year.

---

## Bug #2: No Transaction Classifier — Missing Types (CRITICAL)
**Files:** `tax-computation-engine.ts:221-232`, `coindcx-api.ts:547`
**Impact:** transfers, deposits, rewards, airdrops all treated incorrectly or missing.

**Current Code (tax-computation-engine.ts:221):**
```ts
const trades = fyTransactions.filter(tx =>
    tx.transactionType === 'buy' || tx.transactionType === 'sell' ||
    tx.transactionType === 'swap_in' || tx.transactionType === 'swap_out'
);
```

**Problem:**
1. No canonical event classifier — classification is scattered.
2. `deposit` type is treated as a buy (creates cost basis) at line 447.
3. Self-transfers would create phantom cost-basis lots.
4. No distinct handling for `airdrop`, `referral_bonus`.

---

## Bug #3: `netGain` Label Shows `taxableCapitalGains` Not Net (UI BUG)
**File:** `Crypto.tsx:766`

**Current:**
```ts
netGain: taxComputation.taxableCapitalGains,  // This is GROSS GAINS only (no loss offset)
```

**Problem:** The UI label says "Net Gain/Loss" but the value is `taxableCapitalGains` which is `grossGains` only (per 115BBH, losses cannot be offset). This is confusing — the label implies net but the value is gross profits.

**Fix:** Display `netGainLossInfo` (which is grossGains - grossLosses) for the "Net Gain/Loss" card, and show `taxableCapitalGains` separately in the tax section.

---

## Bug #4: Sell Volume Mismatch — TDS Not Matching KoinX (SIGNIFICANT)
**Impact:** TDS = 1% of sell volume. KoinX says ₹28,770.38 ↔ sell volume ₹28.92L. TaxMitra says ₹20.8K TDS ↔ sell volume ₹20.8L.

**Root Cause:** Missing trades due to:
1. CoinDCX API `limit: 500` may not fetch ALL trades (pagination issue).
2. P2P trades are not available via API.
3. Some USDT-pair sells may have wrong INR conversion.

---

## Bug #5: TDS Computed as 1% on ALL Sells Unconditionally (MINOR)
**File:** `coindcx-api.ts:542`

```ts
const tdsAmount = trade.side === 'sell' ? grossInr * 0.01 : 0;
```

**Problem:** TDS is applied to every sell regardless of ₹50,000/₹10,000 threshold. Per Section 194S, no TDS if total consideration ≤ thresholds. However, in practice CoinDCX deducts TDS on all sells (exchange handles thresholds), so this may actually be correct for API-sourced data.

---

## Bug #6: Trade Pagination — Only First 500 Trades Fetched (CRITICAL)
**File:** `coindcx-api.ts:912 (fullCoinDCXSync)`

```ts
const tradesResult = await fetchCoinDCXTradeHistory(credentials, { limit: 500 });
```

**Problem:** CoinDCX API returns at most 500 trades per request. If the user has more than 500 trades, the remaining are silently dropped. KoinX reports 71 total trade events (from "Trade Types" pie chart), but TaxMitra shows 139 trades which may include duplicates or the API returns individual fills.

**Fix:** Implement pagination using `from_id` parameter.

---

## Bug #7: Fee Handling — Fees Not Deducted from Acquired Quantity (MEDIUM)
**File:** `tax-computation-engine.ts:457`

```ts
const lot: TaxLot = {
    originalQuantity: tx.quantity,  // Full quantity, fee not deducted
    costBasisPerUnit: costBasis,
};
```

**Problem:** On a buy trade, if the fee is in the base asset (e.g., buying 1 BTC and paying 0.001 BTC fee), the actual acquired quantity is 0.999 BTC. Currently, the lot is created with the full 1 BTC, overstating holdings.

For Indian tax purposes (115BBH), fees can be added to cost of acquisition. So if fee is in base asset, reduce quantity. If fee is in quote asset (INR), add to cost.

---

## Bug #8: Crypto-to-Crypto Trades Not Handled as Two-Leg (MEDIUM)
**Files:** `tax-computation-engine.ts:446-448`

```ts
const isBuy = tx.transactionType === 'buy' || tx.transactionType === 'swap_in' || ...;
const isSell = tx.transactionType === 'sell' || tx.transactionType === 'swap_out';
```

**Problem:** Currently, a swap_out is treated as a sell of the base asset, but there's no corresponding "buy" of the received asset. For crypto-to-crypto trades (e.g., swap ETH for BTC):
1. It should be treated as: SELL ETH → BUY BTC
2. The "proceeds" of selling ETH = fair market value in INR
3. The "cost" of buying BTC = same fair market value in INR

Currently, only the sell leg is handled. The buy leg (creating a new lot for the received asset) may be missing unless the API returns separate buy/sell records.

---

## Bug #9: `taxableCapitalGains` = grossGains (Correct) but UI Says "Net" (CONFUSING)
Per Section 115BBH, losses on VDA cannot be set off against gains. So `taxableCapitalGains = grossGains` is CORRECT. But the UI displays this as "Net Gain/Loss" which is misleading.

---

## Bug #10: Rewards with Zero grossAmountInr (DATA ISSUE)
**Problem:** CoinDCX API does not return reward/staking data. The `otherVDAIncome` will always be 0 until rewards are manually added.

---

## IMPLEMENTATION PLAN

### Phase 1: Core Engine Fixes (tax-computation-engine.ts)

1. **IST-aware FY detection** — New pure function `toIST()` and `mapTxToFinancialYear()`
2. **Canonical event classifier** — `classifyVdaEvent(tx)` enum
3. **Fee handling** — Cost basis adjustment for fees
4. **Proper net gain display** — Fix UI stat mapping

### Phase 2: API Data Fixes (coindcx-api.ts)

1. **Pagination** — Fetch ALL trades, not just 500
2. **Data accuracy** — Verify all sell volume is captured
3. **TDS matching** — Align with KoinX methodology

### Phase 3: UI Alignment (Crypto.tsx)

1. **Net Gain vs Taxable Gain** — Separate cards
2. **TDS display** — Match KoinX format
3. **Volume accuracy** — Sell volume = total consideration from engine
