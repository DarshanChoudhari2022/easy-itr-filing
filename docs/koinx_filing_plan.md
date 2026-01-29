# KoinX-Style "No-CA" Individual Filing Plan

To enable a 100% autonomous, zero-knowledge tax filing experience for individuals (including crypto owners), we will implement the following:

## 1. Zero-Knowledge ITR Classifier
*   **Plain English Checklist**: Instead of asking for "ITR Form", we ask:
    *   [ ] Do you have a salary?
    *   [ ] Do you own more than 1 house?
    *   [ ] Do you trade stocks or crypto?
    *   [ ] Are you a freelancer/consultant?
    *   [ ] Do you hold shares in a US company (like Google/Amazon)?
*   **Logic Engine**: 
    *   Salary + 1 House + Interest = **ITR-1**
    *   Capital Gains (Stocks/Crypto) = **ITR-2**
    *   Freelancing/Consultancy < 75L = **ITR-4 (Presumptive)**
    *   Freelancing + Capital Gains = **ITR-3**

## 2. Deep Crypto Integration (KoinX Mode)
*   **Transaction Sync**: Allow pasting CSV/JSON from Binance/CoinDCX/KoinX directly into the wizard.
*   **Section 115BBH Enforcement**: Highlighting 30% tax on gains without loss set-off.
*   **Per-Token Reporting**: Automatically filling the "Schedule VDA" required for the ITR.

## 3. The "One-Click" Submission Workflow
1.  **Data Ingestion**: Sync AIS/TIS + Form 16 + Crypto Report.
2.  **Regime Battle**: AI compares Old vs New regime and auto-selects the one saving most money.
3.  **Audit Pack**: Generating a "Why I filed this way" explanation for the user.
4.  **JSON Export**: Direct export of ITR JSON for the portal.

## 4. Implementation Steps Today
1.  **Enhance `GuidedFiling.tsx`**: Add the Intelligent Income Selection logic.
2.  **Improve `Crypto.tsx`**: Add a "Send to ITR" feature.
3.  **Update `Dashboard.tsx`**: Add a "Which ITR should I file?" widget.
