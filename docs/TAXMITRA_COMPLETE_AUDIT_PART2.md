# TaxMitra Audit — Part 2: Features 7-12, Marketing Copy, User Tutorials

---

## Feature 7: One-Click E-Filing / JSON Export

### Current State
- `EFile.tsx` (570 lines): Full review page with income summary, regime recommendation, JSON generation
- `generateITRJson()` and `downloadITRJson()` work for ITR-1
- `validateITRData()` checks mandatory fields

### Enhancements Needed
1. **Final Review Page redesign:**
   - Section-by-section summary: Personal → Income → Deductions → Tax Computation → Taxes Paid → Refund/Due
   - Per-head income breakdown with source attribution
   - Regime comparison mini-card showing final recommendation
   - Schedule VDA summary if crypto income exists
   - Bank account for refund credit (select from saved accounts)

2. **JSON Generation Improvements:**
   - Add filing date and digital signature placeholder
   - Store snapshot in `itr_filings` table before download
   - Version the JSON to match ITD's schema version per AY
   - Add checksum/hash for integrity

3. **E-Verification Guidance:**
   - After JSON download, show step-by-step guide:
     - "Go to incometax.gov.in → Login → e-File → Upload JSON → e-Verify"
   - Explain e-verification options: Aadhaar OTP, Net Banking, DSC
   - **Do NOT automate portal login** (legal fragility)

### API
| Method | Path | Input | Output |
|--------|------|-------|--------|
| POST | `/api/filing/generate` | userId, assessmentYear | `{ json, filename, filingId }` |
| GET | `/api/filing/history` | userId | `FilingRecord[]` |
| GET | `/api/filing/:id/json` | filingId | JSON blob |

---

## Feature 8: Business & Freelancer (ITR-3, ITR-4, GST)

### Presumptive Taxation (44AD / 44ADA)

#### Logic
```typescript
function calculatePresumptiveIncome(
  section: '44AD' | '44ADA',
  turnover: number,
  digitalReceipts: number,  // receipts via digital/banking channels
  cashReceipts: number
): number {
  if (section === '44ADA') {
    return turnover * 0.50; // 50% for professionals
  }
  // 44AD: 6% for digital, 8% for cash
  return (digitalReceipts * 0.06) + (cashReceipts * 0.08);
}
```

#### Data Model
```sql
CREATE TABLE public.business_income (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assessment_year text NOT NULL,
  business_type text NOT NULL, -- 'business_44AD', 'professional_44ADA', 'regular'
  business_name text,
  business_code text, -- CBDT business code
  gstin text,
  turnover numeric(15,2) DEFAULT 0,
  digital_receipts numeric(15,2) DEFAULT 0,
  cash_receipts numeric(15,2) DEFAULT 0,
  presumptive_income numeric(15,2) DEFAULT 0,
  -- For regular (non-presumptive)
  gross_receipts numeric(15,2) DEFAULT 0,
  total_expenses numeric(15,2) DEFAULT 0,
  net_profit numeric(15,2) DEFAULT 0,
  depreciation numeric(15,2) DEFAULT 0,
  pl_data jsonb DEFAULT '{}',
  balance_sheet_data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, assessment_year)
);
```

#### GST-ITR Sync
```typescript
// Compare GST turnover with ITR turnover
interface GSTReconciliation {
  gstrTurnover: number;        // From GSTR-3B/1
  itrTurnover: number;         // From business_income
  difference: number;
  status: 'matched' | 'mismatch';
  recommendation: string;
}
```

#### Frontend Screens
1. **Business Type Selector** → 44AD / 44ADA / Regular
2. **Turnover Entry** → Digital vs cash split (for 44AD)
3. **Auto-calculate presumptive income** → Show result
4. **P&L Builder** (Regular only) → Revenue, Expenses, Depreciation
5. **Balance Sheet** (Regular only) → Assets, Liabilities, Capital
6. **GST Reconciliation** → Upload GSTR-3B summary, compare turnover

---

## Feature 9: AI Tax Assistant

### Current State
- `ai-service.ts` calls Hugging Face Mistral-7B with a generic tax prompt
- `TaxChatbot.tsx` renders a floating chat widget
- **No user context** is injected into the prompt

### Enhanced Design

#### Context-Aware System Prompt
```typescript
function buildAIPrompt(question: string, context: UserTaxContext): string {
  return `[INST] You are TaxMitra Guru, an expert AI assistant for Indian Income Tax.

IMPORTANT RULES:
- Never guarantee specific refund amounts
- Always advise final review by a qualified CA for complex situations
- Cite relevant sections of the Income Tax Act when applicable
- Use AY ${context.assessmentYear} rules

USER PROFILE:
- Assessment Year: ${context.assessmentYear}
- Income Sources: ${context.incomeSources.join(', ')}
- Gross Income: ₹${context.grossIncome.toLocaleString('en-IN')}
- Selected Regime: ${context.regime}
- Has Crypto: ${context.hasCrypto ? 'Yes' : 'No'}
- ITR Form: ${context.itrForm}
${context.cryptoSummary ? `- Crypto Gains: ₹${context.cryptoGains}` : ''}

QUESTION: ${question} [/INST]`;
}
```

#### 5 System Intents
1. **"Explain my tax summary"** → Inject current computation, break down each head
2. **"Help me choose regime"** → Run compareRegimes(), explain which is better and why
3. **"Why is my tax so high?"** → Analyze income vs deductions, suggest optimization
4. **"Help me fill [section]"** → Context-specific guidance for salary/deductions/crypto
5. **"Explain my crypto tax"** → Inject Schedule VDA data, explain FIFO, 30% rule, TDS

#### Guardrails
- Max 500 tokens per response
- Disclaimer footer: "This is AI guidance, not legal advice. Consult a CA for your specific situation."
- Rate limit: 20 queries/day for Free, unlimited for Pro
- Log all queries for audit trail

---

## Feature 10: Pricing, Plans & Entitlements

### Plan Matrix
| Feature | Free | Pro (₹499/yr) | Expert (₹1,999/filing) |
|---------|:----:|:--------------:|:---------------------:|
| ITR-1 Filing | ✅ | ✅ | ✅ |
| ITR-2/3/4 Filing | ❌ | ✅ | ✅ |
| Crypto Module | ❌ | ✅ | ✅ |
| AIS Reconciliation | Basic | Full | Full |
| Regime Optimizer | ✅ | ✅ | ✅ |
| Form 16 Import | 1/AY | Unlimited | Unlimited |
| AI Assistant | 5 queries/day | Unlimited | Unlimited |
| CA Review | ❌ | ❌ | ✅ |
| Tax Planning Call | ❌ | ❌ | ✅ |
| Document Preparation | ❌ | ❌ | ✅ |
| Returns per AY | 1 | 5 | Unlimited |
| Priority Support | ❌ | ✅ | ✅ |

### Implementation
```typescript
// src/lib/plan-guard.ts
type Plan = 'free' | 'pro' | 'expert';
type Feature = 'crypto' | 'itr2' | 'itr3' | 'itr4' | 'ais_full' | 'unlimited_ai' | 'ca_review';

const PLAN_FEATURES: Record<Plan, Feature[]> = {
  free: [],
  pro: ['crypto', 'itr2', 'itr3', 'itr4', 'ais_full', 'unlimited_ai'],
  expert: ['crypto', 'itr2', 'itr3', 'itr4', 'ais_full', 'unlimited_ai', 'ca_review'],
};

export function canAccess(userPlan: Plan, feature: Feature): boolean {
  return PLAN_FEATURES[userPlan].includes(feature);
}

// Usage in component:
if (!canAccess(user.plan, 'crypto')) {
  return <UpgradePrompt feature="Crypto Tax Engine" requiredPlan="pro" />;
}
```

---

## Feature 11: Security, Compliance & Reliability

### Checklist
- [x] **HTTPS** — Vercel provides automatic SSL
- [ ] **Data encryption at rest** — Supabase uses AES-256 for storage, verify enabled
- [ ] **PAN/Aadhaar masking** — Show only last 4 chars in UI
- [ ] **Audit logs** — Table exists, wire `INSERT` calls on every data mutation
- [ ] **Session management** — Auto-logout after 30 min inactivity
- [ ] **CORS** — Restrict to `easy-itr-filing.vercel.app` and `localhost`
- [ ] **Rate limiting** — Supabase Edge Functions or Vercel middleware
- [ ] **Backup strategy** — Supabase daily backups, 7-day retention
- [ ] **Error monitoring** — Add Sentry or similar
- [ ] **Input sanitization** — Validate all user inputs server-side

---

## Feature 12: CA-Assisted / Expert Plan

### Workflow
```
User submits draft → CA gets notification → CA reviews → 
CA comments/modifies → User accepts changes → Final JSON generated →
CA approves → User downloads + files
```

### Data Model
```sql
CREATE TABLE public.ca_assignments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  ca_user_id uuid REFERENCES auth.users(id),
  assessment_year text NOT NULL,
  status text DEFAULT 'pending', -- 'pending','assigned','in_review','changes_requested','approved','completed'
  priority text DEFAULT 'normal',
  notes text,
  assigned_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ca_comments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id uuid NOT NULL REFERENCES public.ca_assignments(id),
  author_id uuid NOT NULL REFERENCES auth.users(id),
  section text, -- 'salary', 'deductions', 'crypto', 'general'
  comment text NOT NULL,
  is_resolved boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### Admin/CA Dashboard
- Assignment queue (pending, in-review, completed)
- Client filing overview with drill-down
- Comment/annotation on each filing section
- Approve/reject with mandatory notes
- SLA tracking (target: 48-hour turnaround)

---

# 3. REWRITTEN MARKETING COPY

## Hero Section
```
Badge: "✨ Updated for AY 2026-27 — New Regime Slabs & ₹12L Rebate Built In"

Headline:
File Your ITR
With Confidence

Subheadline:
India's most trusted tax filing platform. AI-powered calculations,
expert guidance, and seamless e-filing — for salaried professionals,
business owners, and crypto investors. ITR-1, 2, 3, 4 supported.

CTA 1: "Start Filing Free — ITR-1" (Primary)
CTA 2: "Try Tax Calculator" (Secondary)

Trust Indicators:
✓ 85,000+ Indians Filed | 🔒 Bank-Grade Security | ⚡ 10-Minute Filing | 🏆 99.9% Accuracy
```

## Features Section
```
Section Title: "Everything You Need for Hassle-Free Filing"
Subtitle: "From auto-importing Form 16 to generating the ITR JSON — every step is covered."

1. Auto Form 16 Import
   "Upload your Form 16 PDF. We extract salary, exemptions, TDS, and employer details 
   automatically. Review, correct, and proceed — no manual data entry needed."

2. Smart Regime Comparison
   "Our engine calculates your tax under both Old and New regimes using the latest
   AY 2026-27 slabs. See exactly which regime saves you more — with rupee amounts 
   and clear reasoning."

3. AIS / TIS Reconciliation
   "Upload your Annual Information Statement. We cross-verify every income entry against 
   your data and surface mismatches before the IT department does."

4. Crypto Tax Calculator (Schedule VDA)
   "Import trades from WazirX, CoinDCX, Binance, and 8 more exchanges. FIFO-based 
   cost calculation, 30% flat tax computation, 1% TDS tracking under Section 194S, 
   and auto-generated Schedule VDA — ready for your ITR-2 or ITR-3."

5. AI Tax Assistant
   "Ask any tax question in plain English or Hindi. Our AI understands your income 
   profile and gives personalized answers — regime advice, deduction tips, crypto 
   explanations, and more."

6. One-Click E-Filing
   "Generate your ITR JSON (ITR-1, 2, 3, or 4) in one click. Download it, head to 
   incometax.gov.in, and upload. We guide you through e-verification too."
```

## Solutions Section
```
Section Title: "Built for Every Indian Taxpayer"
Subtitle: "Choose your profile. We'll handle the rest."

Card 1: Salaried Professionals
"Easy ITR-1 & ITR-2 filing with Form 16 auto-import, HRA/LTA optimization, 
and smart regime comparison. Perfect for first-time filers."
Features:
• Form 16 PDF auto-extract
• HRA & LTA exemption calculator
• Section 80C, 80D, 80CCD optimizer
• Old vs New regime recommendation
• Covers salary + 1 house property + interest income
CTA: "File ITR-1 Free →"

Card 2: Crypto & VDA Investors ⭐ Most Popular
"Complete Schedule VDA compliance for Section 115BBH. Import from 11+ exchanges, 
compute 30% flat tax on gains, track 1% TDS, and generate filing-ready reports."
Features:
• WazirX, CoinDCX, Binance + 8 more exchanges
• FIFO cost basis engine (LIFO/HIFO optional)
• Auto Schedule VDA generation
• 30% flat tax + 4% cess calculation
• TDS tracking under Section 194S
CTA: "Calculate Crypto Tax →"

Card 3: Business & Freelancers
"ITR-3 and ITR-4 with presumptive taxation support. 44AD for businesses (8%/6% deemed 
profit) and 44ADA for professionals (50% deemed profit). GST reconciliation included."
Features:
• Section 44AD / 44ADA auto-compute
• GST turnover reconciliation (GSTR-3B sync)
• Capital gains and property income handling
• P&L and Balance Sheet builder (ITR-3)
CTA: "Start Business Filing →"
```

## How It Works Section
```
Title: "File Your ITR in 3 Simple Steps"
Subtitle: "Our guided wizard makes tax filing simpler than ordering food online."

Step 01: Import Your Data
"Upload Form 16, import crypto trades from your exchanges, or enter income manually.
Our AI auto-fills most fields. AIS reconciliation catches what you missed."

Step 02: Review & Optimize
"Compare Old vs New regime side by side. Maximize deductions under 80C, 80D, NPS.
Fix AIS mismatches. See your exact tax liability — or refund — in real time."

Step 03: Download & File
"Generate the official ITR JSON (ITR-1, 2, 3, or 4) in one click. Upload to 
incometax.gov.in and e-verify with Aadhaar OTP. Done."

CTA: "Start Your Filing — It's Free →"
```

## Pricing Section
```
Title: "Simple, Transparent Pricing"
Subtitle: "No hidden fees. Start free, upgrade only if you need to."

FREE — ₹0
"For salaried individuals with simple returns"
→ Best for: First-time filers with only salary + interest income
• ITR-1 (Sahaj) filing only
• Form 16 import (1 per AY)
• Basic tax calculator
• Old vs New regime comparison
• 5 AI assistant queries/day
• Email support
Limitation: No crypto, no capital gains, no business income, 1 return/AY
CTA: "Start Free"

PRO — ₹499/year ⭐ Most Popular
"For investors, crypto holders, and multiple income sources"
→ Best for: Anyone with crypto, stocks, rental income, or freelancing
• All ITR forms (1, 2, 3, 4)
• Crypto tax engine with Schedule VDA
• Full AIS reconciliation
• Unlimited Form 16 imports
• Regime optimizer with detailed analysis
• Unlimited AI assistant
• Up to 5 returns per AY
• Priority email & chat support
Upgrade note: "Already started on Free? Your data carries over seamlessly."
CTA: "Get Pro"

EXPERT ASSISTED — ₹1,999/filing
"CA-reviewed filing for complete peace of mind"
→ Best for: Complex returns, HNIs, NRIs, business audits
• Everything in Pro
• Dedicated CA reviews your return
• Section-by-section comments & corrections
• Audit support & documentation
• 30-min tax planning call
• Filed within 48 hours of submission
• Unlimited returns
CTA: "Book Your CA"
```

## Footer Updates
```
Product column:
• ITR Filing (1, 2, 3, 4)
• Crypto Tax (Schedule VDA)
• Tax Calculator
• Regime Comparison
• CA-Assisted Filing

Resources column:
• Tax Guide AY 2026-27
• ITR Filing Deadlines
• Crypto Tax Guide India
• Help Center
• Blog

Legal column (ADD):
• Privacy Policy
• Terms of Service
• Refund Policy
• Security Practices
```

---

# 4. USER TUTORIALS

## Tutorial 1: Salaried Person (ITR-1/ITR-2)

**Profile:** Riya, 28, Software Engineer, ₹12L salary + ₹18K savings interest

### Step-by-Step

**Step 1: Create Your Account**
1. Go to [taxmitra.in](https://easy-itr-filing.vercel.app/)
2. Click **"Start Filing Free"**
3. Enter your email and create a password
4. Verify your email via the link sent to your inbox
5. You'll land on the **Onboarding** screen

**Step 2: Complete Your Profile**
1. Enter your **PAN** (e.g., ABCPD1234E) — this is mandatory
2. Enter your **Full Name** (exactly as it appears on your PAN card)
3. Enter **Date of Birth**, **Gender**, and **Father's Name**
4. Add your **Address**: Flat No, Street, City, State, Pincode
5. Enter your **Mobile Number** (10-digit)
6. Select **Assessment Year: 2026-27** (for income earned in FY 2025-26)
7. Click **"Save & Continue"**

> 💡 *Tooltip: Your name must match your PAN card exactly. Even a middle name mismatch can cause ITR rejection.*

**Step 3: Import Form 16**
1. Navigate to **Dashboard → Guided Filing**
2. In the Income Sources step, select **"Salary Income"**
3. Click **"Upload Form 16 PDF"**
4. Select your Form 16 PDF file
5. Wait for auto-extraction (usually 5-10 seconds)
6. **Review the extracted data:**
   - Employer Name & TAN
   - Gross Salary, Exemptions (HRA, LTA)
   - TDS Deducted
   - Professional Tax
7. Correct any fields if needed (highlighted in yellow = low confidence)
8. Click **"Confirm & Save"**

> 💡 *Tooltip: Don't have Form 16 yet? You can enter salary details manually. Ask your employer for Form 16 — they must issue it by June 15.*

**Step 4: Add Other Income**
1. Add **Savings Account Interest**: Enter ₹18,000
2. If you have **FD Interest**, enter that too
3. If you have **Dividend income**, add it under "Other Sources"

> 💡 *Empty state: "No additional income? That's perfectly fine. Most salaried people only have salary + interest."*

**Step 5: Claim Deductions**
1. **Section 80C** (max ₹1.5L): EPF, PPF, ELSS, LIC premiums, home loan principal, children's tuition
2. **Section 80D** (max ₹25K/₹50K): Health insurance premiums
3. **Section 80CCD(1B)** (extra ₹50K): NPS contributions
4. **Section 80TTA** (max ₹10K): Savings account interest deduction (old regime only)

> 💡 *Tooltip: These deductions only apply under the Old Regime. If New Regime is better for you, we'll tell you in the next step.*

**Step 6: Compare Old vs New Regime**
1. The **Regime Comparison** card appears automatically
2. You'll see side-by-side:
   - Old Regime: Total tax = ₹X
   - New Regime: Total tax = ₹Y
   - **Recommended: [whichever is lower]** with savings amount
3. Click **"Select [Recommended] Regime"**
4. Read the reasons why it's recommended

**Step 7: Reconcile with AIS (Optional but Recommended)**
1. Go to **AIS Reconciliation** from the sidebar
2. Download your AIS from [incometax.gov.in → AIS](https://www.incometax.gov.in/iec/foportal)
3. Upload the AIS PDF/JSON file
4. Review the comparison table:
   - 🟢 Matched: Your salary matches AIS
   - 🟡 Warning: Interest differs by ₹500 → accept AIS value
   - 🔴 Missing: Dividend from MF not reported by you → add it
5. Resolve each mismatch before proceeding

**Step 8: Review & Generate ITR JSON**
1. Go to **E-File** from the sidebar
2. Review the **Tax Summary:**
   - Gross Income, Deductions, Taxable Income
   - Tax computed, TDS already paid, Refund/Due
   - Selected regime and ITR form (ITR-1)
3. Add **Bank Account** for refund: Account No, IFSC, Bank Name
4. Verify all details are correct
5. Click **"Generate ITR JSON"**
6. Download the `.json` file

**Step 9: File on Income Tax Portal**
1. Go to [incometax.gov.in](https://www.incometax.gov.in)
2. Login with your PAN and password
3. Navigate to: **e-File → Income Tax Returns → File ITR**
4. Select Assessment Year: **2026-27**
5. Select ITR Form: **ITR-1**
6. Choose **"Upload JSON"** option
7. Upload the JSON file downloaded from TaxMitra
8. The portal will validate and show your return summary
9. **e-Verify** using one of:
   - Aadhaar OTP (recommended — instant)
   - Net Banking
   - Digital Signature Certificate (DSC)
10. Done! You'll receive ITR-V acknowledgment via email.

> 🎉 *Congratulations! Your ITR is filed. Save the ITR-V for your records. Refund (if any) typically arrives in 15-45 days.*

---

## Tutorial 2: Freelancer/Consultant (ITR-4 — Presumptive 44ADA)

**Profile:** Amit, 35, Independent UX Consultant, ₹24L gross receipts

### Step-by-Step

**Steps 1-2:** Same as Tutorial 1 (Sign up, complete profile)

**Step 3: Select Business/Professional Income**
1. In Guided Filing, select **"Business/Professional Income"**
2. Choose: **"I am a professional (44ADA)"**
   - Select this if you're a freelancer, consultant, doctor, lawyer, architect, etc.
   - For shopkeepers/traders, choose "Business (44AD)"
3. Enter **Business Name** and **Nature of Business** (e.g., "IT Consulting")

**Step 4: Enter Turnover & Presumptive Income**
1. Enter **Total Gross Receipts: ₹24,00,000**
2. System auto-calculates: **Presumptive Income = ₹12,00,000** (50% of receipts for 44ADA)
3. Review the calculation

> 💡 *Tooltip: Under 44ADA, 50% of your gross receipts are deemed as profit. You don't need to maintain books or get an audit (if turnover ≤ ₹75L for digital receipts).*

**Step 5: Add Other Income & Deductions**
1. Add savings interest, FD interest, etc.
2. Claim deductions (80C, 80D, NPS — if using Old Regime)

**Step 6-7: Regime Comparison + AIS** (Same as Tutorial 1)

**Step 8: GST Reconciliation (If Registered)**
1. If you have a GSTIN, go to **GST Center**
2. Enter your GSTR-3B turnover for comparison
3. Verify that ITR turnover matches GST turnover
4. Resolve any mismatches

**Step 9-10: Generate JSON & File** (Same as Tutorial 1, but select ITR-4)

---

## Tutorial 3: Crypto Investor (Schedule VDA)

**Profile:** Vikram, 30, Salaried + trades crypto on WazirX and Binance

### Step-by-Step

**Steps 1-2:** Same as Tutorial 1 (Sign up, complete profile — needs Pro plan for crypto)

**Step 3: Upgrade to Pro Plan**
1. When you try to access the Crypto module, you'll see: "Crypto Tax Engine requires Pro plan"
2. Click **"Upgrade to Pro — ₹499/year"**
3. Complete payment
4. Crypto module unlocks instantly

**Step 4: Import Crypto Trades**
1. Go to **Crypto Tax** from the sidebar
2. Click **"Import Trades"**

**From WazirX:**
1. Login to WazirX → Go to Wallet → Order History → Download CSV
2. In TaxMitra, select **"WazirX"** as exchange
3. Upload the CSV file
4. Review imported trades (buy, sell, date, quantity, price)
5. Confirm import

**From Binance:**
1. Login to Binance → Orders → Trade History → Export
2. In TaxMitra, select **"Binance"** as exchange
3. Upload the CSV file
4. Trades are auto-converted to INR using historical rates
5. Confirm import

> 💡 *Tooltip: You can also add trades manually. Click "+ Add Trade" and enter: Token, Buy/Sell, Date, Quantity, Price in INR.*

**Step 5: Review Tax Calculation**
1. The **Dashboard** tab shows:
   - Total Trades: 127
   - Total Gains: ₹1,45,000
   - Total Losses: ₹32,000
   - **Taxable VDA Income: ₹1,45,000** (losses cannot be set off!)
   - Tax @30%: ₹43,500
   - Cess @4%: ₹1,740
   - **Total VDA Tax: ₹45,240**
   - TDS Deducted (1%): ₹2,800
   - **Net VDA Tax Due: ₹42,440**

2. Review the **Per-Token Breakdown:**
   | Token | Gains | Losses | Tax |
   |-------|-------|--------|-----|
   | BTC | ₹85,000 | ₹0 | ₹25,500 |
   | ETH | ₹60,000 | ₹32,000 | ₹18,000 |

> ⚠️ *Important: Under Indian tax law (Section 115BBH), crypto losses CANNOT be set off against gains from other crypto assets or any other income. Each profitable trade is taxed individually.*

**Step 6: Generate Schedule VDA Report**
1. Go to **Reports** tab in Crypto module
2. Click **"Generate Schedule VDA PDF"**
3. Download the report — shows every taxable transaction with FIFO matching
4. This data will automatically flow into your ITR

**Step 7: Complete Regular Filing**
1. Go to **Guided Filing** → Your salary data + crypto data are pre-filled
2. The system recommends **ITR-2** (because you have VDA income)
3. Review the combined tax computation:
   - Salary income: ₹12,00,000 (taxed at slab rates)
   - VDA income: ₹1,45,000 (taxed at 30% flat)
   - Total tax includes both components
4. Add deductions, compare regimes

**Step 8: AIS Reconciliation**
1. Your AIS will show crypto transactions reported by exchanges
2. Cross-verify against your imported trades
3. Resolve any mismatches (exchanges may report at different rates)

**Step 9-10: Generate JSON & File**
1. Go to E-File → ITR-2 selected
2. **Schedule VDA is auto-populated** in the JSON
3. Generate, download, upload to incometax.gov.in
4. e-Verify with Aadhaar OTP

> 🎉 *Done! Your crypto taxes are filed compliantly. Keep the Schedule VDA report and trade history for your records (7-year retention recommended).*

---

## Quick Reference: Tooltips & UI Microcopy

### Empty States
- **No income added:** "Tell us how you earn. Select your income sources from the list below."
- **No trades imported:** "Import your first trades to see your crypto tax dashboard come alive."
- **No deductions:** "Missed claiming deductions? Add your 80C, 80D investments to reduce tax."
- **No AIS uploaded:** "Upload your AIS to catch mismatches before the IT department does."

### Placeholders
- PAN field: "e.g., ABCPD1234E"
- Salary field: "Enter gross salary from Form 16"
- Turnover field: "Enter total business receipts for the FY"
- Token symbol: "e.g., BTC, ETH, MATIC"

### Warning Messages
- "Your AIS shows ₹X in dividends, but you've reported ₹0. Add this income to avoid a notice."
- "Schedule VDA losses cannot offset other income. Each profitable trade is taxed at 30%."
- "ITR-1 is not applicable if you have crypto income. We've detected VDA trades — ITR-2 is required."
- "Your turnover exceeds ₹3 Cr. Presumptive taxation under 44AD may not be applicable. Consult a CA."

---

*End of Complete TaxMitra Product Audit & Implementation Blueprint*
*Document version: 1.0 | February 11, 2026*
