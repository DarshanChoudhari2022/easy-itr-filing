/**
 * TaxMitra Comprehensive Crypto Tax Report Generator
 * Generates a detailed multi-page PDF for tax filing
 * 
 * Sections:
 * 1. Cover Page with User Info
 * 2. Transaction Preferences (Tax Settings)
 * 3. Summary of Capital Gains
 * 4. TDS Deducted by Exchanges
 * 5. Self Filing Tips
 * 6. Summary of Other Incomes
 * 7. Summary of Other Expenses, STTs, and Deduction Direct
 * 8. Summary of Asset Wise P&L
 * 9. Capital Gains Transactions (detailed lot matching)
 * 10. Schedule VDA Transactions
 * 
 * For FY 2025-26 (AY 2026-27)
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ============= TYPES =============

export interface ComprehensiveReportData {
    user: {
        name: string;
        pan: string;
        email: string;
    };
    financialYear: string;
    assessmentYear: string;
    generatedAt: Date;

    // Tax Settings / Transaction Preferences
    settings: {
        calculationMethod: string;
        treatAirdropsAsIncome: boolean;
        treatOtherGainsAsCapitalGains: boolean;
        treatCryptoToCryptoAsTaxable: boolean;
        treatRewardsAsIncome: boolean;
        treatInterestAsIncome: boolean;
        treatExternalDepositAsIncome: boolean;
        treatExternalWithdrawalAsSale: boolean;
        treatLoanRepaymentAsSale: boolean;
        offsetBrokerageFeesInTrades: boolean;
        treatStablecoinsAsFiat: boolean;
    };

    // Capital Gains Summary
    capitalGains: {
        numberOfTransfers: number;
        saleConsideration: number;
        costOfAcquisition: number;
        taxableCapitalGains: number;
        losses: number;
    };

    // TDS by Exchange
    exchangeTDS: {
        sourceName: string;
        customName: string;
        tdsDeducted: number;
    }[];

    // Other Incomes (staking, rewards, interest, mining)
    otherIncomes: {
        rewardsReceived: number;
        stakingIncome: number;
        interestIncome: number;
        miningIncome: number;
        airdropIncome: number;
        total: number;
    };

    // Other Expenses
    otherExpenses: {
        brokerageFee: number;
        total: number;
    };

    // Asset-wise P&L
    assetWisePnL: {
        assetName: string;
        grossProfit: number;
        grossLoss: number;
        netGains: number;
    }[];

    // Capital Gains Transactions (FIFO lot matching)
    capitalGainsTxns: {
        datePurchased: string;
        dateSold: string;
        asset: string;
        quantity: number;
        purchaseValue: number;
        saleValue: number;
        gainOrLoss: number;
        source: string;
        remarks: string;
    }[];

    // Schedule VDA for ITR
    scheduleVDA: {
        slNo: number;
        dateOfTransfer: string;
        headOfIncome: string;
        descriptionOfVDA: string;
        saleConsideration: number;
        costOfAcquisition: number;
        gainLoss: number;
    }[];
}

// ============= HELPER =============

function formatINR(amount: number, showSign = false): string {
    const abs = Math.abs(amount);
    let str: string;
    if (abs >= 10000000) str = `INR ${(abs / 10000000).toFixed(2)} Cr`;
    else if (abs >= 100000) str = `INR ${(abs / 100000).toFixed(2)} L`;
    else str = `${abs.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    if (showSign && amount < 0) str = '-' + str;
    return str;
}

function formatINRExact(amount: number): string {
    return `${Math.abs(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ============= MAIN GENERATOR =============

export function generateComprehensiveReport(data: ComprehensiveReportData): void {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Brand Colors
    const brandPrimary: [number, number, number] = [67, 56, 202]; // Indigo-700
    const brandDark: [number, number, number] = [17, 24, 39]; // Gray-900
    const brandGray: [number, number, number] = [75, 85, 99]; // Gray-600
    const brandGreen: [number, number, number] = [5, 150, 105];
    const brandRed: [number, number, number] = [185, 28, 28];
    const bgLight: [number, number, number] = [249, 250, 251];

    let yPos = 0;

    // ============================================
    // PAGE 1: COVER + TRANSACTION PREFERENCES
    // ============================================

    // Header bar
    doc.setFillColor(...brandPrimary);
    doc.rect(0, 0, pageWidth, 50, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(26);
    doc.setFont('helvetica', 'bold');
    doc.text('PREMIUM CRYPTO TAX REPORT', pageWidth / 2, 22, { align: 'center' });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('TaxMitra — Precision-Engineered Crypto Tax Compliance', pageWidth / 2, 34, { align: 'center' });

    doc.setFontSize(9);
    doc.text(`Report ID: ${Math.random().toString(36).substring(2, 10).toUpperCase()}`, pageWidth / 2, 44, { align: 'center' });

    yPos = 60;

    // User Info Box
    doc.setFillColor(...bgLight);
    doc.roundedRect(10, yPos, pageWidth - 20, 35, 3, 3, 'F');

    doc.setTextColor(...brandDark);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Taxpayer Information', 15, yPos + 10);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...brandGray);
    doc.text(`Name: ${data.user.name}`, 15, yPos + 18);
    doc.text(`PAN: ${data.user.pan}`, 15, yPos + 25);
    doc.text(`Financial Year: ${data.financialYear}`, pageWidth / 2 + 5, yPos + 18);
    doc.text(`Assessment Year: ${data.assessmentYear}`, pageWidth / 2 + 5, yPos + 25);
    doc.text(`Generated: ${data.generatedAt.toLocaleDateString('en-IN')}`, pageWidth / 2 + 5, yPos + 32);

    yPos += 45;

    // Country & Currency
    doc.setTextColor(...brandDark);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Country:', 15, yPos);
    doc.setFont('helvetica', 'bold');
    doc.text('INDIA', 45, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text('Currency:', 15, yPos + 8);
    doc.setFont('helvetica', 'bold');
    doc.text('INR', 45, yPos + 8);

    yPos += 20;

    // ---- TRANSACTION PREFERENCES TABLE ----
    doc.setTextColor(...brandPrimary);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Transaction Preferences', 15, yPos);
    yPos += 5;

    const settingsRows = [
        ['Calculation Method', 'First-in First-out (FIFO)', data.settings.calculationMethod === 'FIFO' ? 'First-in First-out (FIFO)' : data.settings.calculationMethod],
        ['Treat Airdrops as Income', 'Yes', data.settings.treatAirdropsAsIncome ? 'Yes' : 'No'],
        ['Treat Other Gains as Capital Gains', 'No', data.settings.treatOtherGainsAsCapitalGains ? 'Yes' : 'No'],
        ['Treat Crypto to Crypto Trades as Taxable', 'Yes', data.settings.treatCryptoToCryptoAsTaxable ? 'Yes' : 'No'],
        ['Treat Rewards as Income', 'Yes', data.settings.treatRewardsAsIncome ? 'Yes' : 'No'],
        ['Treat Interest as Income', 'Yes', data.settings.treatInterestAsIncome ? 'Yes' : 'No'],
        ['Treat External Deposit as Income', 'No', data.settings.treatExternalDepositAsIncome ? 'Yes' : 'No'],
        ['Treat External Withdrawal as Sale', 'No', data.settings.treatExternalWithdrawalAsSale ? 'Yes' : 'No'],
        ['Treat Loan Repayment as Sale', 'No', data.settings.treatLoanRepaymentAsSale ? 'Yes' : 'No'],
        ['Offset Brokerage Fees in Trades', 'No', data.settings.offsetBrokerageFeesInTrades ? 'Yes' : 'No'],
        ['Treat Stablecoins as FIAT', 'No', data.settings.treatStablecoinsAsFiat ? 'Yes' : 'No'],
    ];

    autoTable(doc, {
        startY: yPos,
        head: [['Tax Settings', 'Default', 'Your Preference']],
        body: settingsRows,
        theme: 'grid',
        headStyles: {
            fillColor: brandPrimary,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9
        },
        bodyStyles: { fontSize: 9, textColor: brandDark },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
            0: { cellWidth: 80 },
            1: { cellWidth: 45, halign: 'center' },
            2: { cellWidth: 45, halign: 'center' }
        },
        margin: { left: 15, right: 15 }
    });

    // ============================================
    // PAGE 2: CAPITAL GAINS SUMMARY + TDS + TIPS
    // ============================================
    doc.addPage();
    yPos = 20;

    // Section Header
    doc.setFillColor(...brandPrimary);
    doc.rect(10, yPos - 5, pageWidth - 20, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary of Capital Gains', 15, yPos + 3);

    yPos += 15;
    doc.setTextColor(...brandGray);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('Summary of capital gains applicable crypto transfers during the year.', 15, yPos);

    yPos += 8;

    // Capital Gains summary table
    const cgRows = [
        ['a', 'Number of Transfers', `(Total number of applicable crypto transfers during the year)`, data.capitalGains.numberOfTransfers.toString()],
        ['b', 'Sale Consideration', `(Total sale consideration received from transfer of crypto assets)`, formatINRExact(data.capitalGains.saleConsideration)],
        ['c', 'Cost of Acquisition', `(Total cost to purchase those crypto assets)`, formatINRExact(data.capitalGains.costOfAcquisition)],
        ['d', 'Taxable Capital Gains before losses and expenses', `(As per Indian tax law, only profits are taxed without any deduction or set-off for losses and expenses)`, formatINRExact(data.capitalGains.taxableCapitalGains)],
        ['e', 'Losses', `(Gross loss from all capital gains applicable transfers - cannot be set off in tax return)`, formatINRExact(data.capitalGains.losses)],
    ];

    autoTable(doc, {
        startY: yPos,
        head: [['', 'Label', 'Description', 'Amount (INR)']],
        body: cgRows,
        theme: 'grid',
        headStyles: {
            fillColor: [230, 230, 250],
            textColor: brandDark,
            fontStyle: 'bold',
            fontSize: 10,
            halign: 'center'
        },
        bodyStyles: { fontSize: 9, textColor: brandDark, cellPadding: 3 },
        columnStyles: {
            0: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
            1: { cellWidth: 50, fontStyle: 'bold' },
            2: { cellWidth: 70, textColor: brandGray, fontSize: 8 },
            3: { cellWidth: 43, halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: 15, right: 15 }
    });

    yPos = (doc as any).lastAutoTable.finalY + 8;
    doc.setTextColor(...brandRed);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('* Note: Tax is calculated on Gross Profits (item d). Losses (item e) cannot be deducted from gains.', 15, yPos);
    yPos += 15;

    yPos = (doc as any).lastAutoTable.finalY + 15;

    // ---- TDS DEDUCTED BY EXCHANGES ----
    doc.setTextColor(...brandPrimary);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('TDS deducted by exchanges', 15, yPos);

    yPos += 5;
    doc.setTextColor(...brandGray);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('Total amount of TDS deducted by various exchanges in India and amount liable to TDS but whose details were not found.', 15, yPos);

    yPos += 8;

    if (data.exchangeTDS.length > 0) {
        autoTable(doc, {
            startY: yPos,
            head: [['Source name', 'Custom name', 'TDS Deducted (INR)']],
            body: data.exchangeTDS.map(e => [e.sourceName, e.customName, formatINRExact(e.tdsDeducted)]),
            theme: 'grid',
            headStyles: { fillColor: brandPrimary, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
            bodyStyles: { fontSize: 9, textColor: brandDark },
            columnStyles: { 2: { halign: 'right' } },
            margin: { left: 15, right: 15 }
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;
    } else {
        doc.setTextColor(...brandDark);
        doc.setFontSize(9);
        doc.text('Sale value for which TDS details were not found', 15, yPos);
        yPos += 5;
        doc.text('No records available.', 15, yPos);
        yPos += 12;
    }

    // ---- SELF FILING TIPS ----
    doc.setTextColor(...brandPrimary);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Self Filing Tips', 15, yPos);

    yPos += 8;
    doc.setTextColor(...brandDark);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    const tips = [
        'No set-off of any loss is allowed (Even within same coin/pair).',
        'Tax on capital gains will be at 30% plus surcharge and 4% cess.',
        'If there is a loss, it cannot be carried forward to future years.',
        'TDS can be claimed in the Income Tax Return.',
        'Capital Gains from VDAs are to be disclosed in Schedule VDA of Income Tax Return.',
        'Crypto to Crypto trades are taxable events in India.',
        'Keep proof of purchase (screenshots, exchange statements) for all assets.',
    ];

    tips.forEach((tip, i) => {
        doc.text(`${i + 1}.   ${tip}`, 20, yPos);
        yPos += 6;
    });

    // ============================================
    // PAGE 3: OTHER INCOMES + OTHER EXPENSES
    // ============================================
    doc.addPage();
    yPos = 20;

    // ---- SUMMARY OF OTHER INCOMES ----
    doc.setFillColor(...brandPrimary);
    doc.rect(10, yPos - 5, pageWidth - 20, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary of Other Incomes', 15, yPos + 3);

    yPos += 12;
    doc.setTextColor(...brandGray);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('Summary of incomes from airdrops, rewards, staking, interest, mining and any other income.', 15, yPos);
    yPos += 8;

    const otherIncomeRows: string[][] = [];
    if (data.otherIncomes.rewardsReceived > 0) otherIncomeRows.push(['Rewards received', formatINRExact(data.otherIncomes.rewardsReceived)]);
    if (data.otherIncomes.stakingIncome > 0) otherIncomeRows.push(['Staking Income', formatINRExact(data.otherIncomes.stakingIncome)]);
    if (data.otherIncomes.interestIncome > 0) otherIncomeRows.push(['Interest Income', formatINRExact(data.otherIncomes.interestIncome)]);
    if (data.otherIncomes.miningIncome > 0) otherIncomeRows.push(['Mining Income', formatINRExact(data.otherIncomes.miningIncome)]);
    if (data.otherIncomes.airdropIncome > 0) otherIncomeRows.push(['Airdrop Income', formatINRExact(data.otherIncomes.airdropIncome)]);

    if (otherIncomeRows.length === 0) {
        otherIncomeRows.push(['No other income recorded', '0.00']);
    }

    otherIncomeRows.push(['Total', formatINRExact(data.otherIncomes.total)]);

    autoTable(doc, {
        startY: yPos,
        head: [['Summary of Other Incomes', 'Amount (INR)']],
        body: otherIncomeRows,
        theme: 'grid',
        headStyles: { fillColor: brandPrimary, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9, textColor: brandDark },
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
        margin: { left: 15, right: 15 },
        didParseCell: (data: any) => {
            // Bold the total row
            if (data.row.index === otherIncomeRows.length - 1) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [226, 232, 240];
            }
        }
    });
    yPos = (doc as any).lastAutoTable.finalY + 15;

    // ---- SUMMARY OF OTHER EXPENSES, STTs, AND DEDUCTION DIRECT ----
    doc.setFillColor(...brandPrimary);
    doc.rect(10, yPos - 5, pageWidth - 20, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary of Other Expenses, STTs, and Deduction Direct', 15, yPos + 3);

    yPos += 12;
    doc.setTextColor(...brandGray);
    doc.setFontSize(8);
    doc.text('Summary of expenses not already offset.', 15, yPos);
    yPos += 8;

    autoTable(doc, {
        startY: yPos,
        head: [['Summary of Other Expenses, STTs, and Deduction Direct', 'Amount (INR)']],
        body: [
            ['Brokerage Fee', formatINRExact(data.otherExpenses.brokerageFee)],
            ['Total', formatINRExact(data.otherExpenses.total)],
        ],
        theme: 'grid',
        headStyles: { fillColor: brandPrimary, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        bodyStyles: { fontSize: 9, textColor: brandDark },
        columnStyles: { 1: { halign: 'right' } },
        margin: { left: 15, right: 15 },
        didParseCell: (data: any) => {
            if (data.row.index === 1) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [226, 232, 240];
            }
        }
    });

    // ============================================
    // PAGE 4: ASSET-WISE P&L
    // ============================================
    doc.addPage();
    yPos = 20;

    doc.setFillColor(...brandPrimary);
    doc.rect(10, yPos - 5, pageWidth - 20, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary of Asset Wise P&L', 15, yPos + 3);

    yPos += 12;
    doc.setTextColor(...brandGray);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('Summary of realised profits and loss across assets.', 15, yPos);
    yPos += 8;

    if (data.assetWisePnL.length > 0) {
        autoTable(doc, {
            startY: yPos,
            head: [['Asset Name', 'Gross Profit (INR)', 'Gross Loss (INR)', 'Net Gains (INR)']],
            body: data.assetWisePnL.map(a => [
                a.assetName,
                formatINRExact(a.grossProfit),
                a.grossLoss > 0 ? formatINRExact(a.grossLoss) : '0.00',
                a.netGains >= 0
                    ? formatINRExact(a.netGains)
                    : `-${formatINRExact(Math.abs(a.netGains))}`
            ]),
            theme: 'grid',
            headStyles: {
                fillColor: brandPrimary,
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 10
            },
            bodyStyles: { fontSize: 9, textColor: brandDark, cellPadding: 3 },
            alternateRowStyles: { fillColor: bgLight },
            columnStyles: {
                0: { cellWidth: 40 },
                1: { halign: 'right', cellWidth: 40 },
                2: { halign: 'right', cellWidth: 40 },
                3: { halign: 'right', cellWidth: 40, fontStyle: 'bold' }
            },
            margin: { left: 15, right: 15 },
            didParseCell: (data: any) => {
                // Color net gains: green for profit, red for loss
                if (data.column.index === 3 && data.section === 'body') {
                    const val = data.cell.raw as string;
                    if (val.startsWith('-')) {
                        data.cell.styles.textColor = brandRed;
                    } else {
                        data.cell.styles.textColor = brandGreen;
                    }
                }
            }
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // Add Totals row manually
    const totalProfit = data.assetWisePnL.reduce((s, a) => s + a.grossProfit, 0);
    const totalLoss = data.assetWisePnL.reduce((s, a) => s + a.grossLoss, 0);
    const totalNet = data.assetWisePnL.reduce((s, a) => s + a.netGains, 0);

    doc.setFillColor(226, 232, 240);
    doc.rect(15, yPos - 2, pageWidth - 30, 10, 'F');
    doc.setTextColor(...brandDark);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL', 20, yPos + 5);
    doc.text(formatINRExact(totalProfit), 95, yPos + 5, { align: 'right' });
    doc.text(formatINRExact(totalLoss), 135, yPos + 5, { align: 'right' });
    doc.setTextColor(...(totalNet >= 0 ? brandGreen : brandRed));
    doc.text(totalNet >= 0 ? formatINRExact(totalNet) : `-${formatINRExact(Math.abs(totalNet))}`, 180, yPos + 5, { align: 'right' });

    // ============================================
    // PAGE 5+: CAPITAL GAINS TRANSACTIONS
    // ============================================
    doc.addPage();
    yPos = 20;

    doc.setFillColor(...brandPrimary);
    doc.rect(10, yPos - 5, pageWidth - 20, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Capital Gains Transactions', 15, yPos + 3);

    yPos += 12;
    doc.setTextColor(...brandGray);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text(`Detailed list of all capital gains transactions during the year ${data.financialYear}.`, 15, yPos);
    doc.text('* Note: Purchase price excludes brokerage and other fees.', 15, yPos + 6);
    yPos += 14;

    if (data.capitalGainsTxns.length > 0) {
        autoTable(doc, {
            startY: yPos,
            head: [['Date purchased', 'Date sold', 'Asset', 'Quantity', 'Purchase value *', 'Sale value', 'Gain or losses', 'Source', 'Remarks']],
            body: data.capitalGainsTxns.map(t => [
                t.datePurchased,
                t.dateSold,
                t.asset,
                Number(t.quantity || 0).toFixed(6),
                formatINRExact(t.purchaseValue),
                formatINRExact(t.saleValue),
                t.gainOrLoss >= 0 ? formatINRExact(t.gainOrLoss) : `-${formatINRExact(Math.abs(t.gainOrLoss))}`,
                t.source,
                t.remarks
            ]),
            theme: 'grid',
            headStyles: {
                fillColor: brandPrimary,
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 7,
                halign: 'center'
            },
            bodyStyles: { fontSize: 7, textColor: brandDark },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
                0: { cellWidth: 20 },
                1: { cellWidth: 20 },
                2: { cellWidth: 15 },
                3: { cellWidth: 18, halign: 'right' },
                4: { cellWidth: 25, halign: 'right' },
                5: { cellWidth: 25, halign: 'right' },
                6: { cellWidth: 25, halign: 'right' },
                7: { cellWidth: 20 },
                8: { cellWidth: 18 }
            },
            margin: { left: 10, right: 10 },
            didParseCell: (data: any) => {
                // Color gain/loss column
                if (data.column.index === 6 && data.section === 'body') {
                    const val = data.cell.raw as string;
                    if (val.startsWith('-')) {
                        data.cell.styles.textColor = brandRed;
                    } else {
                        data.cell.styles.textColor = brandGreen;
                    }
                }
            }
        });
    }

    // ============================================
    // SCHEDULE VDA PAGE
    // ============================================
    doc.addPage('landscape');
    yPos = 20;

    doc.setFillColor(...brandPrimary);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 30, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Schedule VDA Transactions', doc.internal.pageSize.getWidth() / 2, 14, { align: 'center' });
    doc.setFontSize(10);
    doc.text('Statement of Income from Transfer of Virtual Digital Assets u/s 115BBH', doc.internal.pageSize.getWidth() / 2, 24, { align: 'center' });

    yPos = 40;
    doc.setTextColor(...brandDark);
    doc.setFontSize(10);
    doc.text(`Name: ${data.user.name} | PAN: ${data.user.pan} | AY: ${data.assessmentYear}`, 14, yPos);

    yPos += 10;

    if (data.scheduleVDA.length > 0) {
        autoTable(doc, {
            startY: yPos,
            head: [[
                'Sl. No.',
                'Date of Transfer\n(DD/MM/YYYY)',
                'Head of Income',
                'Description of VDA\n(with Symbol)',
                'Sale Consideration\n(INR)',
                'Cost of Acquisition\n(INR)',
                'Income from Transfer\n(INR)'
            ]],
            body: data.scheduleVDA.map(row => [
                row.slNo.toString(),
                row.dateOfTransfer,
                row.headOfIncome,
                row.descriptionOfVDA,
                row.saleConsideration.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
                row.costOfAcquisition.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
                row.gainLoss >= 0
                    ? row.gainLoss.toLocaleString('en-IN', { minimumFractionDigits: 2 })
                    : `(${Math.abs(row.gainLoss).toLocaleString('en-IN', { minimumFractionDigits: 2 })})`
            ]),
            foot: [[
                '', '', '', 'TOTAL',
                data.scheduleVDA.reduce((s, r) => s + r.saleConsideration, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
                data.scheduleVDA.reduce((s, r) => s + r.costOfAcquisition, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
                data.scheduleVDA.reduce((s, r) => s + r.gainLoss, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })
            ]],
            theme: 'grid',
            headStyles: {
                fillColor: brandPrimary,
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 9,
                halign: 'center',
                valign: 'middle'
            },
            bodyStyles: { fontSize: 9, textColor: brandDark, valign: 'middle' },
            footStyles: {
                fillColor: [241, 245, 249],
                textColor: brandDark,
                fontStyle: 'bold',
                fontSize: 10
            },
            columnStyles: {
                0: { cellWidth: 15, halign: 'center' },
                1: { cellWidth: 30, halign: 'center' },
                2: { cellWidth: 40 },
                3: { cellWidth: 50 },
                4: { cellWidth: 35, halign: 'right' },
                5: { cellWidth: 35, halign: 'right' },
                6: { cellWidth: 35, halign: 'right' }
            },
            margin: { left: 10, right: 10 }
        });
    }

    // ============================================
    // TAX COMPUTATION SUMMARY (Last page)
    // ============================================
    doc.addPage();
    yPos = 20;

    doc.setFillColor(...brandPrimary);
    doc.rect(10, yPos - 5, pageWidth - 20, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Tax Computation Summary', 15, yPos + 4);

    yPos += 20;

    const taxRows = [
        ['A', 'Taxable Capital Gains (Section 115BBH)', formatINRExact(data.capitalGains.taxableCapitalGains)],
        ['B', 'Other Income (Staking, Rewards, Airdrops)', formatINRExact(data.otherIncomes.total)],
        ['C', 'Total Taxable VDA Income (A + B)', formatINRExact(data.capitalGains.taxableCapitalGains + data.otherIncomes.total)],
        ['D', 'Tax @ 30% on Capital Gains', formatINRExact(data.capitalGains.taxableCapitalGains * 0.30)],
        ['E', 'Tax @ 30% on Other Income', formatINRExact(data.otherIncomes.total * 0.30)],
        ['F', 'Total Tax on VDA (D + E)', formatINRExact((data.capitalGains.taxableCapitalGains + data.otherIncomes.total) * 0.30)],
        ['G', 'Surcharge (if applicable)', '0.00'],
        ['H', 'Health & Education Cess @ 4%', formatINRExact((data.capitalGains.taxableCapitalGains + data.otherIncomes.total) * 0.30 * 0.04)],
        ['I', 'Total Tax Liability (F + G + H)', formatINRExact(
            (data.capitalGains.taxableCapitalGains + data.otherIncomes.total) * 0.30 * 1.04
        )],
        ['J', 'TDS Already Paid (Section 194S)', formatINRExact(data.exchangeTDS.reduce((s, e) => s + e.tdsDeducted, 0))],
        ['K', 'Net Tax Payable (I - J)', formatINRExact(
            (data.capitalGains.taxableCapitalGains + data.otherIncomes.total) * 0.30 * 1.04 -
            data.exchangeTDS.reduce((s, e) => s + e.tdsDeducted, 0)
        )],
    ];

    autoTable(doc, {
        startY: yPos,
        head: [['', 'Particulars', 'Amount (INR)']],
        body: taxRows,
        theme: 'grid',
        headStyles: { fillColor: brandPrimary, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10 },
        bodyStyles: { fontSize: 10, textColor: brandDark },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
            0: { cellWidth: 15, halign: 'center', fontStyle: 'bold' },
            1: { cellWidth: 110 },
            2: { cellWidth: 40, halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: 15, right: 15 },
        didParseCell: (data: any) => {
            // Highlight total rows
            if (data.row.index === 5 || data.row.index === 8 || data.row.index === 10) {
                data.cell.styles.fillColor = [226, 232, 240];
                data.cell.styles.fontStyle = 'bold';
            }
            // Highlight final row
            if (data.row.index === 10) {
                data.cell.styles.fillColor = brandPrimary;
                data.cell.styles.textColor = [255, 255, 255];
            }
        }
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Losses disclaimer
    if (data.capitalGains.losses > 0) {
        doc.setFillColor(254, 243, 199);
        doc.roundedRect(15, yPos, pageWidth - 30, 20, 2, 2, 'F');
        doc.setTextColor(146, 64, 14);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('⚠ Non-deductible Losses', 20, yPos + 7);
        doc.setFont('helvetica', 'normal');
        doc.text(`You incurred ${formatINRExact(data.capitalGains.losses)} in losses. Under Section 115BBH, these CANNOT be set-off against gains or carried forward.`, 20, yPos + 14);
        yPos += 28;
    }

    // ============================================
    // FOOTER ON ALL PAGES
    // ============================================
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        const w = doc.internal.pageSize.getWidth();
        const h = doc.internal.pageSize.getHeight();

        // Footer bar
        doc.setFillColor(241, 245, 249);
        doc.rect(0, h - 15, w, 15, 'F');

        doc.setFontSize(7);
        doc.setTextColor(...brandGray);
        doc.text('www.taxmitra.app', 10, h - 6);
        doc.text(`Page ${i} of ${totalPages}`, w - 10, h - 6, { align: 'right' });
    }

    // ============ DISCLAIMER (Last Page) ============
    doc.setPage(totalPages);
    const h = doc.internal.pageSize.getHeight();
    const discY = h - 45;

    doc.setFillColor(254, 226, 226);
    doc.roundedRect(15, discY, pageWidth - 30, 22, 2, 2, 'F');
    doc.setTextColor(153, 27, 27);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('DISCLAIMER:', 20, discY + 7);
    doc.setFont('helvetica', 'normal');
    doc.text('This report is for informational purposes only. Consult a Chartered Accountant before filing.', 20, discY + 13);
    doc.text('Tax calculations are based on available data. TaxMitra is not liable for any discrepancies.', 20, discY + 18);

    // ============ SAVE ============
    const filename = `TaxMitra_CryptoReport_${data.financialYear.replace('-', '_')}_${data.user.pan}.pdf`;
    doc.save(filename);
}

// ============= BUILDER HELPER =============
// Converts engine portfolio data into ComprehensiveReportData format

export function buildComprehensiveReportData(
    portfolio: any,
    trades: any[],
    user: { name: string; pan: string; email: string },
    settings: any,
    financialYear: string = '2025-26',
    assessmentYear: string = '2026-27',
    taxComputation?: any  // TaxComputationResult — primary source of truth
): ComprehensiveReportData {
    // ── PRIMARY: Use TaxComputationResult (engine output) when available ──
    // The engine correctly computes FIFO-matched figures. The trades[] array
    // has known bugs (buy_price used as sell price, all buys not just sold, etc.)

    const engineResult = taxComputation || portfolio;

    // Number of transfers = number of VDA Schedule rows (sell events), NOT token quantity
    const numberOfTransfers = engineResult?.totalVDAEntries
        ?? engineResult?.vdaReportLines?.length
        ?? trades.filter((t: any) => t.trade_type === 'sell').length;

    // Sale consideration = total sell proceeds from engine (correct)
    const saleConsideration = engineResult?.totalConsiderationInr
        ?? engineResult?.totalSellValue
        ?? 0;

    // Cost of acquisition = FIFO-matched cost for SOLD assets only (not all buys)
    const costOfAcquisition = engineResult?.totalCostOfAcquisitionInr
        ?? engineResult?.totalCostValue
        ?? 0;

    // Taxable capital gains = sum of profitable trades only (per 115BBH)
    const taxableCapitalGains = engineResult?.taxableCapitalGains
        ?? engineResult?.totalTaxableGains
        ?? Math.max(0, saleConsideration - costOfAcquisition);

    // Losses = sum of loss-making trades (cannot be offset)
    const losses = engineResult?.grossCapitalLosses
        ?? engineResult?.totalLosses
        ?? 0;

    // Other income (staking, rewards, airdrops, interest)
    const totalOtherIncome = engineResult?.otherVDAIncome
        ?? engineResult?.totalOtherIncome
        ?? 0;

    // TDS credit from engine (most accurate)
    const totalTDSCredit = engineResult?.totalTDSCredit ?? 0;

    // Brokerage fees
    const totalFees = engineResult?.totalBrokerageFee
        ?? trades.reduce((s: number, t: any) => s + (t.fee || t.metadata?.fee || 0), 0);

    // ── Asset-wise P&L from engine ──
    const assetWisePnL = (engineResult?.assetSummaries || engineResult?.breakdown || []).map((b: any) => ({
        assetName: b.assetSymbol ?? b.token ?? 'Unknown',
        grossProfit: b.grossGains ?? b.totalGain ?? 0,
        grossLoss: b.grossLosses ?? b.totalLoss ?? 0,
        netGains: (b.grossGains ?? b.totalGain ?? 0) - (b.grossLosses ?? b.totalLoss ?? 0),
    })).sort((a: any, b: any) => b.netGains - a.netGains);

    // ── Capital Gains Transactions from engine lot matches ──
    const lotMatches = engineResult?.lotMatches
        ?? engineResult?.breakdown?.flatMap((res: any) => res.matchedLots || [])
        ?? [];
    lotMatches.sort((a: any, b: any) => new Date(a.sellDate).getTime() - new Date(b.sellDate).getTime());

    // ── Schedule VDA from engine ──
    const scheduleVDA = (engineResult?.vdaReportLines || []).map((row: any) => ({
        slNo: row.slNo,
        dateOfTransfer: row.dateOfTransfer,
        headOfIncome: row.headOfIncome ?? 'Capital Gains - 115BBH',
        descriptionOfVDA: row.descriptionOfVDA,
        saleConsideration: row.saleConsideration,
        costOfAcquisition: row.costOfAcquisition,
        gainLoss: row.incomeFromTransfer ?? row.gainLoss ?? (row.saleConsideration - row.costOfAcquisition),
    }));

    // ── TDS by Exchange (from trades, since engine aggregates all exchanges) ──
    const exchangeTDSMap: Record<string, number> = {};
    if (totalTDSCredit > 0) {
        // Use engine's total TDS, attributed to CoinDCX (primary exchange)
        exchangeTDSMap['CoinDCX'] = totalTDSCredit;
    } else {
        // Fallback: estimate from sell trades
        trades.forEach((t: any) => {
            if (t.trade_type === 'sell') {
                const exchange = t.exchange || 'Unknown';
                if (!exchangeTDSMap[exchange]) exchangeTDSMap[exchange] = 0;
                exchangeTDSMap[exchange] += (t.metadata?.tds_deducted || 0);
            }
        });
    }

    // ── Other Income breakdown (from engine if available) ──
    // The engine doesn't break down by sub-category, so we use what we have
    const rewardsReceived = totalOtherIncome; // Simplified: all other income as rewards
    const stakingIncome = 0;
    const interestIncome = 0;
    const miningIncome = 0;
    const airdropIncome = 0;

    return {
        user,
        financialYear,
        assessmentYear,
        generatedAt: new Date(),
        settings: {
            calculationMethod: settings.accountingMethod || 'FIFO',
            treatAirdropsAsIncome: settings.treatAirdropsAsIncome ?? true,
            treatOtherGainsAsCapitalGains: false,
            treatCryptoToCryptoAsTaxable: true,
            treatRewardsAsIncome: settings.treatRewardsAsIncome ?? true,
            treatInterestAsIncome: settings.treatInterestAsIncome ?? true,
            treatExternalDepositAsIncome: false,
            treatExternalWithdrawalAsSale: false,
            treatLoanRepaymentAsSale: false,
            offsetBrokerageFeesInTrades: false,
            treatStablecoinsAsFiat: false,
        },
        capitalGains: {
            numberOfTransfers,
            saleConsideration,
            costOfAcquisition,
            taxableCapitalGains,
            losses,
        },
        exchangeTDS: Object.entries(exchangeTDSMap).map(([exchange, tds]) => ({
            sourceName: exchange,
            customName: `${exchange} wallet`,
            tdsDeducted: tds as number
        })),
        otherIncomes: {
            rewardsReceived,
            stakingIncome,
            interestIncome,
            miningIncome,
            airdropIncome,
            total: totalOtherIncome
        },
        otherExpenses: {
            brokerageFee: totalFees,
            total: totalFees,
        },
        assetWisePnL,
        capitalGainsTxns: lotMatches.map((lot: any) => ({
            datePurchased: new Date(lot.buyDate).toLocaleDateString('en-IN'),
            dateSold: new Date(lot.sellDate).toLocaleDateString('en-IN'),
            asset: lot.assetSymbol ?? lot.token ?? 'Unknown',
            quantity: lot.matchedQuantity ?? lot.quantity ?? 0,
            purchaseValue: lot.costOfAcquisition ?? (lot.buyPricePerUnit ?? lot.buyPrice ?? 0) * (lot.matchedQuantity ?? lot.quantity ?? 0),
            saleValue: lot.saleConsideration ?? (lot.sellPricePerUnit ?? lot.sellPrice ?? 0) * (lot.matchedQuantity ?? lot.quantity ?? 0),
            gainOrLoss: lot.gainLoss ?? 0,
            source: 'taxmitra_engine',
            remarks: (lot.holdingDays ?? lot.holdingPeriod ?? 0) < 365 ? 'short-term' : 'long-term'
        })),
        scheduleVDA,
    };
}

