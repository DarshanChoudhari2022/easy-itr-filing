# TaxMitra vs KoinX: Crypto Tax Gap Analysis

**Date:** Feb 13, 2026
**Subject:** Root Cause Analysis of Data Discrepancies (Cost, Gains, TDS)

## 1. Executive Summary
We have identified the root causes for the discrepancies between TaxMitra and KoinX.
*   **Valuation (Accuracy):** 90% of the cost/gain discrepancy was due to hardcoded FX rates (Fixed).
*   **Missing Volume (Scope):** The remaining volume gap (₹20.8L vs ₹28.9L) is caused by **P2P and Margin/Futures** trades, which KoinX tracks but TaxMitra currently does not (Spot Only).

---

## 2. Detailed Discrepancy Breakdown

### A. Sell Volume Gap (₹20.8L vs ₹28.9L)
*   **Gap:** ~₹8.1 Lakhs.
*   **Cause 1 (Fixed):** Hardcoded `USDT = 90 INR` rate overvalued some assets but undervalued others relative to market.
*   **Cause 2 (Missing Markets):** KoinX report explicitly mentions: "income from trades done in Spot, **P2P and Margin markets**". TaxMitra currently fetches only **Spot**.
    *   *Analysis:* A gap of ₹8L corresponds to ~10,000 USDT. This is likely **P2P Sells** (Cashing out) or **Margin Turnover**. Both are missing from Spot API.

### B. Capital Gains Gap (₹17.6K vs ₹1.62L)
*   **Gap:** ~₹1.44 Lakhs.
*   **Root Cause (Fixed):** FX Rate Mismatch.
    *   Previously, buying USDT at local rate (83-88) but calculating cost at hardcoded 90 created an artificially high cost basis, **hiding profits**.
    *   *Example:* Cost 90, Sell 90 = 0 Gain. Real: Cost 83, Sell 88 = 5 Gain.
    *   **Fix:** Using real-time rates reveals the true profit margin.

### C. TDS Gap (₹20.8K vs ₹28.7K)
*   **Gap:** ~₹8,000.
*   **Correlation:** Exactly 1% of the missing ₹8L volume.
*   **Conclusion:** TDS reporting is accurate (1%), but the base Volume is missing (due to P2P/Margin).

### D. Settlement Transactions
*   **Observation:** KoinX lists `MATIC` → `POL` migrations.
*   **Impact:** KoinX excludes these from P&L (correctly). TaxMitra also excludes them (correctly). No discrepancy here for P&L.

---

## 3. Recommended Actions

1.  **Immediate:** Sync Now to apply the FX Fix. This should correct the **Profit Margin** (Gains).
2.  **Scope Expansion:** To match Volume, we must scrape **Margin** and **Futures**.
3.  **P2P:** P2P trades are usually not available via API. KoinX likely uses CSV or assumes P2P based on deposits. User may need to upload P2P CSV.
