/**
 * AIS (Annual Information Statement) Parser & Reconciler
 * Auto-imports and reconciles income data from IT portal
 * Matches with user-entered data to identify discrepancies
 */

export interface AISRecord {
    id: string;
    category: AISCategory;
    subCategory: string;
    informationSource: string; // TAN/PAN of deductor
    sourceName: string;
    transactionDate: string;
    reportedValue: number;
    modifiedValue?: number;
    status: 'accepted' | 'modified' | 'disputed';
    feedback?: string;
    quarterlyBreakup?: {
        q1: number;
        q2: number;
        q3: number;
        q4: number;
    };
}

export type AISCategory =
    | 'TDS_SALARY'
    | 'TDS_INTEREST'
    | 'TDS_DIVIDEND'
    | 'TDS_RENT'
    | 'TDS_PROFESSIONAL'
    | 'TDS_COMMISSION'
    | 'TDS_LOTTERY'
    | 'TDS_PROPERTY_SALE'
    | 'TCS_VEHICLE'
    | 'TCS_FOREIGN_REMITTANCE'
    | 'SFT_SAVINGS'
    | 'SFT_CURRENT'
    | 'SFT_TIME_DEPOSIT'
    | 'SFT_CREDIT_CARD'
    | 'SFT_MUTUAL_FUND'
    | 'SFT_SHARES'
    | 'SFT_PROPERTY'
    | 'SFT_FOREIGN_REMITTANCE'
    | 'OTHER_INCOME'
    | 'INTEREST_INCOME'
    | 'DIVIDEND_INCOME'
    | 'RENTAL_INCOME'
    | 'CAPITAL_GAINS'
    | 'CRYPTO_VDA'
    | 'GST_TURNOVER'
    | 'REFUND_ISSUED';

export interface AISData {
    pan: string;
    financialYear: string;
    assessmentYear: string;
    generatedDate: string;

    // Summary
    totalTDSCredited: number;
    totalTCSCredited: number;
    totalIncome: number;

    // Detailed Records  
    records: AISRecord[];

    // Categorized summaries
    tdsDetails: {
        salary: number;
        interest: number;
        dividend: number;
        rent: number;
        professional: number;
        other: number;
        total: number;
    };

    incomeDetails: {
        salary: number;
        interest: number;
        dividend: number;
        rentalIncome: number;
        capitalGains: number;
        businessIncome: number;
        otherSources: number;
    };

    sftTransactions: {
        savingsDeposits: number;
        timeDeposits: number;
        creditCardPayments: number;
        mutualFundPurchases: number;
        shareTransactions: number;
        propertyTransactions: number;
        foreignRemittances: number;
    };

    warnings: string[];
    lastUpdated: Date;
}

export interface ReconciliationResult {
    status: 'matched' | 'discrepancy' | 'missing_in_ais' | 'missing_in_itr';
    category: string;
    aisValue: number;
    itrValue: number;
    difference: number;
    percentDifference: number;
    recommendation: string;
    severity: 'low' | 'medium' | 'high';
}

/**
 * Parse AIS JSON data (from IT portal download)
 */
export function parseAISJson(jsonData: any): AISData {
    const warnings: string[] = [];
    const records: AISRecord[] = [];

    // Initialize summaries
    const tdsDetails = { salary: 0, interest: 0, dividend: 0, rent: 0, professional: 0, other: 0, total: 0 };
    const incomeDetails = { salary: 0, interest: 0, dividend: 0, rentalIncome: 0, capitalGains: 0, businessIncome: 0, otherSources: 0 };
    const sftTransactions = { savingsDeposits: 0, timeDeposits: 0, creditCardPayments: 0, mutualFundPurchases: 0, shareTransactions: 0, propertyTransactions: 0, foreignRemittances: 0 };

    try {
        // Parse TDS on Salary
        if (jsonData.tdsSalary) {
            jsonData.tdsSalary.forEach((item: any, index: number) => {
                const amount = Number(item.tdsAmount || item.taxDeducted || 0);
                tdsDetails.salary += amount;
                incomeDetails.salary += Number(item.grossSalary || item.income || 0);

                records.push({
                    id: `TDS_SAL_${index}`,
                    category: 'TDS_SALARY',
                    subCategory: 'Salary from Employer',
                    informationSource: item.tan || item.deductorTan || '',
                    sourceName: item.employerName || item.deductorName || 'Employer',
                    transactionDate: item.assessmentYear || '',
                    reportedValue: Number(item.grossSalary || item.income || 0),
                    status: 'accepted'
                });
            });
        }

        // Parse TDS on Interest
        if (jsonData.tdsInterest || jsonData.tdsOnInterest) {
            const items = jsonData.tdsInterest || jsonData.tdsOnInterest || [];
            items.forEach((item: any, index: number) => {
                const tdsAmount = Number(item.tdsAmount || item.taxDeducted || 0);
                const income = Number(item.grossAmount || item.income || 0);
                tdsDetails.interest += tdsAmount;
                incomeDetails.interest += income;

                records.push({
                    id: `TDS_INT_${index}`,
                    category: 'TDS_INTEREST',
                    subCategory: 'Interest Income',
                    informationSource: item.tan || item.deductorTan || '',
                    sourceName: item.bankName || item.deductorName || 'Bank/NBFC',
                    transactionDate: item.transactionDate || '',
                    reportedValue: income,
                    status: 'accepted'
                });
            });
        }

        // Parse Dividend income
        if (jsonData.dividendIncome || jsonData.tdsDividend) {
            const items = jsonData.dividendIncome || jsonData.tdsDividend || [];
            items.forEach((item: any, index: number) => {
                const amount = Number(item.dividendAmount || item.income || 0);
                const tds = Number(item.tdsAmount || 0);
                tdsDetails.dividend += tds;
                incomeDetails.dividend += amount;

                records.push({
                    id: `DIV_${index}`,
                    category: 'DIVIDEND_INCOME',
                    subCategory: 'Dividend from Equity',
                    informationSource: item.isin || item.companyPan || '',
                    sourceName: item.companyName || 'Company',
                    transactionDate: item.recordDate || '',
                    reportedValue: amount,
                    status: 'accepted'
                });
            });
        }

        // Parse SFT - Savings Account
        if (jsonData.sftSavings || jsonData.savingsAccountTransactions) {
            const items = jsonData.sftSavings || jsonData.savingsAccountTransactions || [];
            items.forEach((item: any, index: number) => {
                const amount = parseFloat(item.aggregateAmount || item.amount || 0);
                sftTransactions.savingsDeposits += amount;

                records.push({
                    id: `SFT_SAV_${index}`,
                    category: 'SFT_SAVINGS',
                    subCategory: 'Cash Deposits in Savings',
                    informationSource: item.accountNumber || '',
                    sourceName: item.bankName || 'Bank',
                    transactionDate: item.transactionDate || '',
                    reportedValue: amount,
                    status: 'accepted'
                });
            });
        }

        // Parse Mutual Fund transactions
        if (jsonData.mutualFundTransactions || jsonData.sftMutualFund) {
            const items = jsonData.mutualFundTransactions || jsonData.sftMutualFund || [];
            items.forEach((item: any, index: number) => {
                const amount = parseFloat(item.amount || item.investmentAmount || 0);
                sftTransactions.mutualFundPurchases += amount;

                records.push({
                    id: `MF_${index}`,
                    category: 'SFT_MUTUAL_FUND',
                    subCategory: item.transactionType || 'MF Purchase',
                    informationSource: item.folioNumber || '',
                    sourceName: item.fundName || item.amcName || 'AMC',
                    transactionDate: item.transactionDate || '',
                    reportedValue: amount,
                    status: 'accepted'
                });
            });
        }

        // Parse Share transactions
        if (jsonData.shareTransactions || jsonData.sftShares) {
            const items = jsonData.shareTransactions || jsonData.sftShares || [];
            items.forEach((item: any, index: number) => {
                const amount = parseFloat(item.saleValue || item.amount || 0);
                sftTransactions.shareTransactions += amount;

                if (item.capitalGain) {
                    incomeDetails.capitalGains += parseFloat(item.capitalGain);
                }

                records.push({
                    id: `SHARE_${index}`,
                    category: 'SFT_SHARES',
                    subCategory: item.transactionType || 'Share Transaction',
                    informationSource: item.isin || '',
                    sourceName: item.stockName || item.scrip || 'Stock',
                    transactionDate: item.transactionDate || '',
                    reportedValue: amount,
                    status: 'accepted'
                });
            });
        }

        // Parse Property transactions
        if (jsonData.propertyTransactions || jsonData.sftProperty) {
            const items = jsonData.propertyTransactions || jsonData.sftProperty || [];
            items.forEach((item: any, index: number) => {
                const amount = parseFloat(item.saleValue || item.stampDutyValue || 0);
                sftTransactions.propertyTransactions += amount;

                records.push({
                    id: `PROP_${index}`,
                    category: 'SFT_PROPERTY',
                    subCategory: item.transactionType || 'Property Transaction',
                    informationSource: item.propertyId || '',
                    sourceName: 'Property Sale/Purchase',
                    transactionDate: item.registrationDate || '',
                    reportedValue: amount,
                    status: 'accepted'
                });
            });
        }

        // Crypto/VDA transactions
        if (jsonData.vdaTransactions || jsonData.cryptoTransactions) {
            const items = jsonData.vdaTransactions || jsonData.cryptoTransactions || [];
            items.forEach((item: any, index: number) => {
                const amount = Number(item.saleValue || item.amount || 0);
                const tds = Number(item.tdsAmount || 0);
                incomeDetails.capitalGains += amount;
                tdsDetails.other += tds;

                records.push({
                    id: `VDA_${index}`,
                    category: 'CRYPTO_VDA',
                    subCategory: 'Virtual Digital Asset',
                    informationSource: item.exchangeName || '',
                    sourceName: item.tokenName || 'Crypto',
                    transactionDate: item.transactionDate || '',
                    reportedValue: amount,
                    status: 'accepted'
                });
            });
        }

        // Calculate totals
        tdsDetails.total = tdsDetails.salary + tdsDetails.interest + tdsDetails.dividend +
            tdsDetails.rent + tdsDetails.professional + tdsDetails.other;

    } catch (error) {
        warnings.push(`Parse error: ${(error as Error).message}`);
    }

    return {
        pan: jsonData.pan || '',
        financialYear: jsonData.financialYear || '2025-26',
        assessmentYear: jsonData.assessmentYear || '2026-27',
        generatedDate: jsonData.generatedDate || new Date().toISOString(),
        totalTDSCredited: tdsDetails.total,
        totalTCSCredited: 0,
        totalIncome: incomeDetails.salary + incomeDetails.interest + incomeDetails.dividend +
            incomeDetails.rentalIncome + incomeDetails.capitalGains + incomeDetails.otherSources,
        records,
        tdsDetails,
        incomeDetails,
        sftTransactions,
        warnings,
        lastUpdated: new Date()
    };
}

/**
 * Reconcile AIS data with ITR data
 */
export function reconcileWithITR(aisData: AISData, itrData: {
    salary?: number;
    interest?: number;
    dividend?: number;
    rentalIncome?: number;
    capitalGains?: number;
    businessIncome?: number;
    otherSources?: number;
    tdsSalary?: number;
    tdsInterest?: number;
    tdsDividend?: number;
    tdsOther?: number;
}): ReconciliationResult[] {
    const results: ReconciliationResult[] = [];

    // Helper function
    const compare = (category: string, aisValue: number, itrValue: number, severity: 'low' | 'medium' | 'high'): ReconciliationResult => {
        const diff = Math.abs(aisValue - itrValue);
        const percentDiff = aisValue > 0 ? (diff / aisValue) * 100 : (itrValue > 0 ? 100 : 0);

        let status: ReconciliationResult['status'] = 'matched';
        let recommendation = 'Values match. No action needed.';

        if (aisValue > 0 && itrValue === 0) {
            status = 'missing_in_itr';
            recommendation = `AIS shows ${category} of ₹${aisValue.toLocaleString()}. Please add this to your ITR.`;
        } else if (aisValue === 0 && itrValue > 0) {
            status = 'missing_in_ais';
            recommendation = `ITR shows ${category} not reflected in AIS. Keep supporting documents.`;
        } else if (percentDiff > 5) {
            status = 'discrepancy';
            recommendation = `Difference of ₹${diff.toLocaleString()} (${percentDiff.toFixed(1)}%). Review and reconcile.`;
        }

        return { status, category, aisValue, itrValue, difference: diff, percentDifference: percentDiff, recommendation, severity };
    };

    // Compare each category
    results.push(compare('Salary Income', aisData.incomeDetails.salary, itrData.salary || 0, 'high'));
    results.push(compare('Interest Income', aisData.incomeDetails.interest, itrData.interest || 0, 'medium'));
    results.push(compare('Dividend Income', aisData.incomeDetails.dividend, itrData.dividend || 0, 'medium'));
    results.push(compare('Rental Income', aisData.incomeDetails.rentalIncome, itrData.rentalIncome || 0, 'medium'));
    results.push(compare('Capital Gains', aisData.incomeDetails.capitalGains, itrData.capitalGains || 0, 'high'));

    // TDS comparison
    results.push(compare('TDS on Salary', aisData.tdsDetails.salary, itrData.tdsSalary || 0, 'high'));
    results.push(compare('TDS on Interest', aisData.tdsDetails.interest, itrData.tdsInterest || 0, 'medium'));
    results.push(compare('TDS on Dividend', aisData.tdsDetails.dividend, itrData.tdsDividend || 0, 'medium'));

    return results;
}

/**
 * Generate AIS feedback submission data
 */
export function generateAISFeedback(record: AISRecord, feedbackType: 'accept' | 'modify' | 'deny', modifiedValue?: number, reason?: string) {
    return {
        recordId: record.id,
        category: record.category,
        originalValue: record.reportedValue,
        feedbackType,
        modifiedValue: feedbackType === 'modify' ? modifiedValue : undefined,
        reason: reason || (feedbackType === 'accept' ? 'Information is correct' : 'Information is incorrect'),
        submittedAt: new Date().toISOString()
    };
}

/**
 * Get auto-fill suggestions from AIS data
 */
export function getAutoFillSuggestions(aisData: AISData) {
    return {
        pan: aisData.pan,
        salary: aisData.incomeDetails.salary,
        salaryTDS: aisData.tdsDetails.salary,
        interestIncome: aisData.incomeDetails.interest,
        interestTDS: aisData.tdsDetails.interest,
        dividendIncome: aisData.incomeDetails.dividend,
        dividendTDS: aisData.tdsDetails.dividend,
        capitalGains: aisData.incomeDetails.capitalGains,

        // Suggested deductions based on SFT
        suggestedDeductions80C: Math.min(150000, aisData.sftTransactions.mutualFundPurchases * 0.5), // Assume 50% ELSS

        // Flags
        hasHighValueTransactions: aisData.sftTransactions.savingsDeposits > 1000000 ||
            aisData.sftTransactions.propertyTransactions > 0,
        hasForeignRemittances: aisData.sftTransactions.foreignRemittances > 0,
        hasCryptoTransactions: aisData.records.some(r => r.category === 'CRYPTO_VDA'),

        // Confidence
        dataCompleteness: aisData.records.length > 0 ? 'high' : 'low',
        lastUpdated: aisData.lastUpdated
    };
}
