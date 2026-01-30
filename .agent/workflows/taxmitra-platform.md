---
description: Complete TaxMitra Platform - End-to-End ITR Filing SaaS
---

# TaxMitra Platform Development Plan

## Vision
One-stop tax solution for everyone - from first-time filers to professionals

## Existing Features (Already Built)
- ✅ Dashboard with overview
- ✅ Guided Filing wizard (5 steps)
- ✅ Income sources management
- ✅ Deductions (80C, 80D, etc.)
- ✅ Crypto Tax module (Premium)
- ✅ AIS Reconciliation
- ✅ GST Center
- ✅ Foreign Compliance
- ✅ Tax Vault (Document storage)
- ✅ E-File generation
- ✅ Family dashboard
- ✅ Client management (for CAs)

## Priority Enhancements

### Phase 1: Core Filing Experience (Immediate)
// turbo-all
1. **Smart ITR Form Selection** - Auto-detect right form (ITR-1/2/3/4) based on income
2. **Form 16 Parser** - Upload PDF, auto-extract salary data
3. **AIS Auto-Import** - Fetch from income tax portal
4. **26AS Integration** - Auto-match TDS credits
5. **Live Tax Calculator** - Real-time old vs new regime comparison

### Phase 2: Income Sources (Week 2)
1. **Salary Income** - HRA, LTA, Standard Deduction optimization
2. **House Property** - Rental income, home loan interest
3. **Capital Gains** - Stocks, Mutual Funds, Property
4. **Business/Professional** - Presumptive taxation (44AD/44ADA)
5. **Other Sources** - Interest, Dividends, Gifts

### Phase 3: Unique Features
1. **AI Tax Assistant** - Answer queries, suggest optimizations
2. **Regime Comparison** - Side-by-side old vs new analysis
3. **TDS Mismatch Detector** - Flag 26AS discrepancies
4. **Advance Tax Calculator** - Due dates & amounts
5. **Previous Year Return Import** - Auto-fill from last year
6. **Multi-Assessment Year** - File for any FY

### Phase 4: Compliance & Reporting
1. **ITR-V Generation** - Acknowledgment PDF
2. **ITR-JSON Export** - For e-filing portal upload
3. **Computation Sheet** - Detailed tax breakdown
4. **Form 10IE** - Regime declaration
5. **Form 67** - Foreign tax credit

## Database Tables Needed
- profiles (user info, PAN)
- income_sources (salary, property, business, etc.)
- deductions (80C, 80D, HRA, etc.)
- crypto_trades (VDA transactions)
- tax_credits (TDS, advance tax, self-assessment)
- documents (uploaded PDFs)
- itr_filings (submission history)
- ais_data (imported AIS records)

## Tech Stack
- Frontend: React + TypeScript + Vite
- UI: Shadcn/UI + Tailwind
- Backend: Supabase (Auth, DB, Storage)
- PDF: jsPDF, pdf-lib
- Charts: Recharts

## Key Differentiators
1. **Simplest UX** - 3 clicks to file
2. **AI-Powered** - Smart suggestions
3. **Crypto-First** - Best VDA support in India
4. **Free for Salaried** - ITR-1 free forever
5. **Real-time Sync** - Changes reflect instantly
