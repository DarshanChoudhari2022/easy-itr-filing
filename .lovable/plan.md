

# BharatTax - Comprehensive Indian Tax SaaS Platform

## Overview
A production-ready Indian Tax SaaS for ITR filing (ITR 1-4) with AI-powered conversational guidance, crypto tax calculation, and smart regime optimization. Built for both individual taxpayers and Chartered Accountants/Tax Professionals.

---

## 🎨 Design & Branding

**Visual Identity:**
- **Primary Color:** Navy Blue (#0F172A) - trust & professionalism
- **Secondary Color:** Emerald Green (#10B981) - financial growth & savings
- **Clean, high-trust fintech aesthetic** with generous whitespace
- **Typography:** Modern, readable fonts with clear hierarchy

**Navigation Structure:**
- Collapsible sidebar with sections: Home, Income, Crypto Tax Center, Deductions, Optimizer Dashboard, E-File
- Mobile-responsive design

---

## 🔐 Authentication & User Management

**Multi-Role System:**
- **Individual Users:** Personal tax filing with PAN/Aadhaar storage
- **CA/Professional Accounts:** Multi-client management dashboard
- Email/password authentication with Supabase Auth
- Secure profile management with filing status tracking

**Database Tables:**
- `users` - Core user data with PAN, Aadhaar (encrypted), filing status
- `user_roles` - Role management (individual, professional, admin)
- `clients` - For professionals to manage multiple taxpayer clients

---

## 🤖 Tax Guru - AI Conversational Interface

**Chat-to-File Experience:**
- Welcoming chat UI as the central filing hub
- AI-powered question flow using Lovable AI (Gemini)
- Smart questions: "Did you earn salary this year?", "Any crypto trades on CoinDCX or Binance?", "Home loan interest?"

**Intelligent ITR Detection:**
- **ITR-1 (Sahaj):** Salary + 1 House Property (income ≤ ₹50L)
- **ITR-2:** Crypto/Capital Gains, multiple properties, foreign income
- **ITR-3:** Business/Professional income with books
- **ITR-4 (Sugam):** Presumptive income under 44AD/44ADA

**Data Collection:**
- Progressive disclosure - only asks relevant questions
- Auto-saves responses to database
- Visual progress indicator

---

## 💰 Income Management

**Income Categories:**
- Salary with Form 16 details
- House Property (rental income, home loan interest)
- Capital Gains (equity, mutual funds, property)
- Other Sources (interest, dividends, gifts)
- Business/Professional income

**Features:**
- Add multiple income sources per category
- Document upload for supporting evidence
- Automatic total calculation

---

## ₿ Crypto Tax Center (Section 115BBH)

**Exchange Support:**
- CSV import parsers for **CoinDCX** and **Binance** formats
- Manual trade entry option

**Tax Calculation Engine (2026 Rules):**
- Flat 30% tax on gains
- No loss set-off across different tokens
- 1% TDS (Section 194S) reconciliation

**Visualizations:**
- Gains vs Tax donut chart
- Token-wise breakdown table
- TDS already deducted summary

---

## 📊 Optimizer Dashboard

**Real-Time Tax Liability Display:**
- Live calculation as user enters data
- Clear breakdown of taxable income components

**Regime Comparison:**
- Split-screen: Old Regime vs New Regime
- Old Regime: All deductions (80C, 80D, HRA, etc.)
- New Regime: Lower rates, fewer deductions

**Smart Recommendations:**
- "Maximum Savings" badge on optimal regime
- Savings amount highlighted
- Explanation of why one regime is better

---

## 🔗 External Integration Placeholders

**ITD Sync:**
- "Fetch AIS/26AS" button with loading simulation
- Pre-filled data display (mock)

**Broker Connections:**
- Groww connect button
- Zerodha connect button
- Equity P&L import simulation

*Note: These are UI placeholders ready for real API integration*

---

## 📝 Deductions Section

**Section 80C:** PPF, ELSS, LIC, EPF, etc. (₹1.5L limit)
**Section 80D:** Health Insurance premiums
**Section 80G:** Donations
**Other Sections:** 80E (education loan), 80TTA (savings interest), etc.

**Features:**
- Investment tracker with limits
- Document upload for proofs
- Warning when limits exceeded

---

## 📤 E-File & Summary

**Final Review:**
- Complete tax summary
- ITR form preview
- Verification checklist

**E-File Preparation:**
- Generate JSON for ITR upload
- E-verification options display
- Filing status tracker

---

## 👨‍💼 Professional (CA) Dashboard

**Client Management:**
- Add/manage multiple clients
- Client-wise filing status
- Bulk actions and filters

**Quick Actions:**
- Switch between client profiles
- Deadline tracking calendar
- Document request system

---

## 🔒 Security & Compliance

- Row-Level Security (RLS) on all tables
- Encrypted storage for sensitive data (PAN, Aadhaar)
- Audit trail for all changes
- GDPR/Data protection compliance ready

---

## 📱 Responsive Design

- Full mobile support for on-the-go filing
- Touch-optimized interactions
- Progressive web app ready

---

## 🔗 Footer

- Public Repository link for open-source contributions
- Help Center link
- Privacy Policy & Terms
- Contact support

