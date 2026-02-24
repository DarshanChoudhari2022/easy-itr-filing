# KoinX-Matching Crypto Tax Engine — Implementation Plan

**Date:** 2026-02-24
**Goal:** Build a crypto tax engine that matches KoinX's calculations exactly for Indian compliance

---

## 1. ROOT CAUSE ANALYSIS — Why TaxMitra ≠ Koinx

### Problem 1: Transaction Count Mismatch (71 vs 210)
**Root Cause:** TaxMitra includes **fill-level trades** from API, while KoinX aggregates fills per order.
- CoinDCX API returns individual fills (partial executions of a single order)
- One order "Buy 1 BTC" may execute as 5 fills at slightly different prices
- KoinX aggregates fills into **order-level transactions** (1 order = 1 transaction)
- TaxMitra counts each fill separately → inflated count (210 vs 71)

**Fix:** Add **order-level aggregation** — group fills by `order_id`, sum quantities, compute VWAP price.

### Problem 2: Capital Gains Discrepancy (₹1.64L vs ₹1.31L)
**Root Cause:** Multiple compound issues:
- a) **FIFO lot matching on fills vs orders** produces different cost basis allocation
- b) **UNKNOWN token trades** from trial endpoints inflate cost
- c) **Fee handling differences** — KoinX may include fees differently
- d) **Sale price computation** — fills have individual prices but order has VWAP

**Fix:** Aggregate fills to order level BEFORE running FIFO.

### Problem 3: TDS Credit Mismatch
**Root Cause:** Computing TDS as 1% × total sell volume (theoretical) instead of using actual TDS data.
- KoinX uses actual TDS deducted per transaction
- TaxMitra computes theoretical TDS and falls back to it when certs not uploaded

**Fix:** Only use actual TDS from trade data or CSV certificates. Never guess.

### Problem 4: Fee Treatment
**KoinX Approach (confirmed via research):**
- Section 115BBH(2): Only "cost of acquisition" is deductible
- Trading fees, brokerage, gas fees are **NOT deductible**
- Fee paid in base asset reduces received quantity (physical fact, not tax choice)
- Fee paid in quote asset is a separate cost, does NOT adjust cost basis

**Status:** Current TaxMitra engine handles this correctly per `VDA_COMPLIANCE.BROKERAGE_REDUCES_COST_BASIS = false`.

---

## 2. KEY FIX: ORDER-LEVEL AGGREGATION

### The Core Insight
KoinX groups fills into orders. This is the single biggest source of discrepancy.

```
CoinDCX API returns:
  Fill 1: Buy 0.1 BTC @ ₹50,100 (order ABC)
  Fill 2: Buy 0.1 BTC @ ₹50,200 (order ABC)  
  Fill 3: Buy 0.3 BTC @ ₹50,150 (order ABC)

KoinX shows:
  Order ABC: Buy 0.5 BTC @ ₹50,150 (VWAP) → 1 transaction

TaxMitra shows:
  3 separate transactions → different FIFO lot matching
```

### Implementation
```typescript
interface AggregatedOrder {
  orderId: string;
  assetSymbol: string;
  quoteAsset: string;
  pair: string;
  transactionType: 'buy' | 'sell';
  totalQuantity: number;      // sum of fill quantities
  vwapPrice: number;           // volume-weighted average price
  totalGrossAmountInr: number; // sum of (qty × price) for each fill
  totalFee: number;            // sum of fees
  feeAsset: string;
  totalTds: number;            // sum of TDS
  firstTimestamp: Date;        // earliest fill timestamp
  lastTimestamp: Date;         // latest fill timestamp
  fillCount: number;           // number of fills
}
```

---

## 3. IMPLEMENTATION STEPS

### Step 1: Create `order-aggregator.ts`
- Input: `NormalizedTransaction[]` (fill-level)
- Output: `NormalizedTransaction[]` (order-level, deduplicated)
- Logic: Group by `orderId`, compute VWAP, sum quantities
- For trades without `orderId`: keep as-is

### Step 2: Apply Aggregation in Tax Engine
- In `computeVdaTaxForFinancialYear()`, aggregate fills BEFORE FIFO processing
- Add a flag `aggregateFills: boolean = true` for backward compat

### Step 3: Fix Transaction Validation
- Reject `assetSymbol === 'UNKNOWN'`
- Reject `quantity <= 0` or `pricePerUnit <= 0 && grossAmountInr <= 0`
- Quarantine suspicious transactions

### Step 4: Fix TDS Credit
- Only use explicit TDS from trades (not theoretical 1%)
- Allow TDS CSV upload to override

### Step 5: Add Reconciliation Checks
- Output: Computed totals vs KoinX reference
- Per-trade validation logging
- Negative inventory detection with detailed logging

---

## 4. VALIDATION CRITERIA

| Metric | KoinX Reference (FY 2024-25) | Must Match |
|--------|------------------------------|------------|
| Transaction Count | 71 | ✓ (±0) |
| Total Sale Consideration | Must derive from KoinX | ✓ (±₹100) |
| Total Cost of Acquisition | Must derive from KoinX | ✓ (±₹100) |
| Total Taxable Gains | ₹1.64L | ✓ (±₹500) |
| TDS Credit | ₹28,770.38 (from data) | ✓ (±₹10) |
| Other Income | ₹1,840.95 | ✓ (±₹10) |
