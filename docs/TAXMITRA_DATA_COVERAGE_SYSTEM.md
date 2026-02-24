# TaxMitra — 100% Data Coverage System Design

> **Goal:** TaxMitra must calculate crypto taxes accurately using ALL available CoinDCX data.
> KoinX values are ONLY for cross-verification — our engine must be self-sufficient.

---

## The Problem

CoinDCX has **4 data channels**. No single channel gives 100% coverage:

| Data Type | API | Order History CSV | TDS Summary CSV | Insta CSV |
|-----------|-----|-------------------|-----------------|-----------|
| **Spot Trades** (buy/sell with qty, price, fee) | ✅ Fills | ✅ Orders | ❌ Only sell value | ❌ |
| **Insta Buy/Sell** (quick buy feature) | ❌ | ❌ | ✅ Sell value + TDS | ✅ Full data |
| **P2P Trades** | ❌ | ❌ | ✅ Sell value + TDS | ❌ |
| **TDS per trade** (actual ₹ deducted) | ❌ | ❌ | ✅ Exact amount | ❌ |
| **Staking Rewards** | ❌ | ❌ | ❌ | ❌ |
| **Airdrops/Cashback** | ❌ | ❌ | ❌ | ❌ |

**Key Insight:** To get 100% coverage, you need:
1. **Order History CSV** → All spot buys + sells with quantity & price (cost basis)
2. **TDS Summary CSV** → All sell events (spot + insta + P2P) with exact TDS
3. **Insta History CSV** (if used) → Buy-side data for Insta trades
4. **Manual Entry** → Staking rewards only (CoinDCX doesn't export these anywhere)

---

## Data Priority Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    TaxMitra Data Merge Engine                │
│                                                             │
│  Priority 1: TDS Summary CSV (sells + TDS authority)        │
│  Priority 2: Order History CSV (spot buys + sells)          │
│  Priority 3: Insta History CSV (insta buys)                 │
│  Priority 4: CoinDCX API (supplementary, fills)             │
│  Priority 5: Manual Entry (staking rewards only)            │
│                                                             │
│  MERGE RULE: Deduplicate by Order ID                        │
│  TDS SOURCE: TDS CSV > Computed 1% > API tdsAmount          │
│  QTY SOURCE: Order CSV > Insta CSV > TDS CSV (estimated)    │
│  PRICE SOURCE: Order CSV > Insta CSV > Derived from value   │
└─────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step: How YOU (the CoinDCX account owner) Get 100% Data

### Step 1: Download Order History CSV
1. Go to **coindcx.com** (desktop browser)
2. Click **Orders** → **Order History**
3. Click **"FILLED ORDERS"** tab
4. Set date range: **01 Apr 2024 → 31 Mar 2025** (for FY 2024-25)
5. Click **"Download CSV"**
6. **This gives you:** Every spot trade — buy & sell — with qty, price, fee, order ID

### Step 2: Download TDS Summary CSV
1. Go to **Downloads** → **TDS Summary** (or Profile → Reports → TDS)
2. Select FY **2024-25**
3. Click **"Export CSV"**
4. **This gives you:** Every sell event + exact TDS deducted (covers spot + insta + P2P)

### Step 3: Download Insta History CSV (if you used Instant Buy/Sell)
1. Go to **Orders** → **Insta History**
2. Set date range for FY
3. Download CSV
4. **This gives you:** Buy-side data for Insta trades (qty, price, fee)

### Step 4: Upload ALL 3 files at once in TaxMitra
- Go to Crypto → Import Data → Upload CSV
- Select all 3 files at once
- TaxMitra auto-detects file types and merges intelligently

### Step 5: Add Staking Rewards manually
- Check your email for "CoinDCX reward" notifications
- Use "+ Add Trade" → Staking Reward for each reward
- This is the ONLY data that requires manual entry

---

## Data Completeness Score

After import, TaxMitra shows a "Data Coverage" score:

| Coverage Level | What You Have | Score |
|---------------|---------------|-------|
| 🔴 API Only | Spot fills only, no TDS, no Insta | 40% |
| 🟡 API + Order CSV | All spot trades, but missing Insta/P2P/TDS | 60% |
| 🟠 API + Order CSV + TDS CSV | All sells + TDS, but Insta buy-side estimated | 85% |
| 🟢 All 3 CSVs | Complete spot + insta + P2P + TDS | 95% |
| ✅ All 3 CSVs + Manual Rewards | Everything | 100% |

---

## What The Engine Computes From Each Source

### From Order History CSV:
- ✅ FIFO cost basis (buy prices for capital gains)
- ✅ Sell consideration for spot trades
- ✅ Brokerage/fees (info only, not deductible per 115BBH)
- ✅ Order-level aggregation (1 order = 1 transaction)

### From TDS Summary CSV:
- ✅ **Exact TDS credit** (₹ amount per sell, not estimated 1%)
- ✅ Sell events for Insta/P2P (that Order CSV doesn't have)
- ✅ Sale consideration for ALL sell types
- ⚠️ No quantity data for Insta/P2P sells (estimated from value)

### From Insta History CSV:
- ✅ Buy-side cost basis for Insta purchases
- ✅ Quantity and price for Insta trades
- ✅ Completes the picture for Insta trades found in TDS CSV

### From API:
- ✅ Real-time balances
- ✅ Supplementary trade data (fills)
- ✅ Market data for FX conversion
- ⚠️ Incomplete: no Insta, no P2P, no TDS, no rewards

### From Manual Entry:
- ✅ Staking rewards (ADA interest, SHIB rewards, etc.)
- ✅ Airdrops and promotional cashback
- ✅ Any other income not in CSV/API

---

## Smart Merge Rules

When data from multiple sources overlap:

1. **Same Order ID in Order CSV + TDS CSV:**
   - Use Order CSV for qty/price (more detailed)
   - Use TDS CSV for exact TDS amount (authoritative)
   - Result: Perfect transaction with both cost basis and TDS

2. **Sell in TDS CSV but NOT in Order CSV:**
   - This is an Insta/P2P sell (not in spot trade history)
   - Use TDS CSV sale consideration as-is
   - Estimate quantity from value / market price
   - Flag for user review

3. **Trade in API but NOT in CSV:**
   - This can happen if user's CSV date range is wrong
   - Keep API data as supplementary
   - Warn user to re-download CSV with correct dates

4. **TDS Credit Priority:**
   - If TDS CSV uploaded → use exact TDS from certificates
   - If no TDS CSV → compute 1% of sell consideration (Section 194S)
   - Never show ₹0 TDS when sells exist

---

## Cross-Verification with KoinX

After TaxMitra computes everything, the KoinX Match tab shows:

| Metric | TaxMitra (computed) | KoinX (reference) | Status |
|--------|--------------------|--------------------|--------|
| Transaction Count | 71 | 71 | ✅ MATCH |
| Taxable Gains | ₹1.64L | ₹1.64L | ✅ MATCH |
| TDS Credit | ₹28,770 | ₹28,770 | ✅ MATCH |
| Other Income | ₹1,841 | ₹1,841 | ✅ MATCH |

**This is verification, not input.** TaxMitra computed these independently.
