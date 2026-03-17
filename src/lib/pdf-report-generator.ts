/**
 * PDF Report Generator for Crypto Tax Reports
 * Generates ITR-compliant Schedule VDA and comprehensive tax reports
 * 
 * For FY 2025-26 (AY 2026-27)
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Types
export interface TaxReportData {
    user: {
        name: string;
        pan: string;
        email: string;
    };
    financialYear: string;
    assessmentYear: string;
    generatedAt: Date;
    summary: {
        totalBuyValue: number;
        totalSellValue: number;
        totalGains: number;
        totalLosses: number;
        netGainLoss: number;
        taxableGains: number;
        taxAt30Percent: number;
        totalTDSPaid: number;
        netTaxPayable: number;
        otherIncome: number; // Staking, mining, airdrops
    };
    transactions: {
        date: string;
        type: string;
        token: string;
        quantity: number;
        pricePerUnit: number;
        totalValue: number;
        exchange: string;
        fee?: number;
        tds?: number;
    }[];
    scheduleVDA: {
        slNo: number;
        dateOfTransfer: string;
        headOfIncome: string;
        descriptionOfVDA: string;
        saleConsideration: number;
        costOfAcquisition: number;
        gainLoss: number;
    }[];
    tokenWiseSummary: {
        token: string;
        totalBought: number;
        totalSold: number;
        avgBuyPrice: number;
        realizedGain: number;
        currentHolding: number;
    }[];
    exchangeWiseTDS: {
        exchange: string;
        totalSales: number;
        tdsDeducted: number;
    }[];
}

/**
 * Generate Complete Tax Report PDF
 */
export function generateCompleteTaxReport(data: TaxReportData): void {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Colors
    const primaryColor: [number, number, number] = [79, 70, 229]; // Indigo
    const darkColor: [number, number, number] = [15, 23, 42]; // Slate-900
    const grayColor: [number, number, number] = [100, 116, 139]; // Slate-500

    let yPos = 20;

    // ============ HEADER ============
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('CRYPTO TAX REPORT', pageWidth / 2, 18, { align: 'center' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Financial Year: ${data.financialYear} | Assessment Year: ${data.assessmentYear}`, pageWidth / 2, 30, { align: 'center' });

    yPos = 55;

    // ============ USER INFO ============
    doc.setTextColor(...darkColor);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Taxpayer Details:', 14, yPos);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...grayColor);
    doc.text(`Name: ${data.user.name}`, 14, yPos + 7);
    doc.text(`PAN: ${data.user.pan}`, 14, yPos + 14);
    doc.text(`Generated: ${data.generatedAt.toLocaleDateString('en-IN')} at ${data.generatedAt.toLocaleTimeString('en-IN')}`, 14, yPos + 21);

    yPos += 35;

    // ============ EXECUTIVE SUMMARY ============
    doc.setFillColor(241, 245, 249); // Slate-100
    doc.rect(10, yPos - 5, pageWidth - 20, 60, 'F');

    doc.setTextColor(...primaryColor);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('EXECUTIVE SUMMARY', 14, yPos + 5);

    doc.setTextColor(...darkColor);
    doc.setFontSize(10);

    const summaryData = [
        ['Total Sale Consideration', `INR ${data.summary.totalSellValue.toLocaleString('en-IN')}`],
        ['Total Cost of Acquisition', `INR ${data.summary.totalBuyValue.toLocaleString('en-IN')}`],
        ['Net Capital Gains', `INR ${data.summary.netGainLoss.toLocaleString('en-IN')}`],
        ['Tax @ 30%', `INR ${data.summary.taxAt30Percent.toLocaleString('en-IN')}`],
        ['TDS Already Paid (1%)', `INR ${data.summary.totalTDSPaid.toLocaleString('en-IN')}`],
        ['Net Tax Payable', `INR ${data.summary.netTaxPayable.toLocaleString('en-IN')}`],
    ];

    let xLeft = 14;
    let xRight = pageWidth / 2 + 10;
    let summaryY = yPos + 15;

    summaryData.forEach((row, i) => {
        const x = i % 2 === 0 ? xLeft : xRight;
        const y = summaryY + Math.floor(i / 2) * 12;
        doc.setFont('helvetica', 'normal');
        doc.text(row[0] + ':', x, y);
        doc.setFont('helvetica', 'bold');
        doc.text(row[1], x + 60, y);
    });

    yPos += 70;

    // ============ TAX RULES REMINDER ============
    doc.setFillColor(254, 243, 199); // Amber-100
    doc.rect(10, yPos, pageWidth - 20, 25, 'F');

    doc.setTextColor(146, 64, 14); // Amber-800
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('IMPORTANT - Section 115BBH (Indian Tax Law):', 14, yPos + 8);
    doc.setFont('helvetica', 'normal');
    doc.text('• VDA (Virtual Digital Assets) gains are taxed at 30% flat rate (no STCG/LTCG distinction)', 14, yPos + 15);
    doc.text('• No set-off of losses allowed against any other income | No deduction except cost of acquisition', 14, yPos + 21);

    yPos += 35;

    // ============ SCHEDULE VDA TABLE ============
    doc.setTextColor(...primaryColor);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('SCHEDULE VDA - Statement of Income from Virtual Digital Assets', 14, yPos);

    yPos += 5;

    if (data.scheduleVDA.length > 0) {
        autoTable(doc, {
            startY: yPos,
            head: [['Sl.', 'Date of Transfer', 'Head of Income', 'Description', 'Sale Value (INR)', 'Cost (INR)', 'Gain/Loss (INR)']],
            body: data.scheduleVDA.map(row => [
                row.slNo.toString(),
                row.dateOfTransfer,
                row.headOfIncome,
                row.descriptionOfVDA,
                row.saleConsideration.toLocaleString('en-IN'),
                row.costOfAcquisition.toLocaleString('en-IN'),
                row.gainLoss.toLocaleString('en-IN')
            ]),
            theme: 'grid',
            headStyles: {
                fillColor: primaryColor,
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 8
            },
            bodyStyles: {
                fontSize: 8,
                textColor: darkColor
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252]
            },
            columnStyles: {
                0: { cellWidth: 10 },
                4: { halign: 'right' },
                5: { halign: 'right' },
                6: { halign: 'right' }
            },
            margin: { left: 10, right: 10 }
        });

        yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // Add new page if needed
    if (yPos > 250) {
        doc.addPage();
        yPos = 20;
    }

    // ============ TOKEN-WISE SUMMARY ============
    doc.setTextColor(...primaryColor);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('TOKEN-WISE PERFORMANCE', 14, yPos);

    yPos += 5;

    if (data.tokenWiseSummary.length > 0) {
        autoTable(doc, {
            startY: yPos,
            head: [['Token', 'Qty Bought', 'Qty Sold', 'Avg Buy (INR)', 'Realized (INR)', 'Holding']],
            body: data.tokenWiseSummary.map(row => [
                row.token,
                Number(row.totalBought || 0).toFixed(6),
                Number(row.totalSold || 0).toFixed(6),
                `${Number(row.avgBuyPrice || 0).toLocaleString('en-IN')}`,
                `${Number(row.realizedGain || 0).toLocaleString('en-IN')}`,
                Number(row.currentHolding || 0).toFixed(6)
            ]),
            theme: 'grid',
            headStyles: {
                fillColor: primaryColor,
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 9
            },
            bodyStyles: {
                fontSize: 9,
                textColor: darkColor
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252]
            },
            margin: { left: 10, right: 10 }
        });

        yPos = (doc as any).lastAutoTable.finalY + 10;
    }

    // Add new page if needed
    if (yPos > 250) {
        doc.addPage();
        yPos = 20;
    }

    // ============ TDS SUMMARY ============
    doc.setTextColor(...primaryColor);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('TDS SUMMARY (Section 194S)', 14, yPos);

    yPos += 5;

    if (data.exchangeWiseTDS.length > 0) {
        autoTable(doc, {
            startY: yPos,
            head: [['Exchange/Platform', 'Total Sales Value (INR)', 'TDS Deducted @ 1% (INR)']],
            body: data.exchangeWiseTDS.map(row => [
                row.exchange,
                row.totalSales.toLocaleString('en-IN'),
                row.tdsDeducted.toLocaleString('en-IN')
            ]),
            theme: 'grid',
            headStyles: {
                fillColor: primaryColor,
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 10
            },
            bodyStyles: {
                fontSize: 10,
                textColor: darkColor
            },
            margin: { left: 10, right: 10 }
        });

        yPos = (doc as any).lastAutoTable.finalY + 15;
    }

    // ============ FOOTER ============
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(...grayColor);
        doc.text(
            `Page ${i} of ${pageCount} | Generated by EasyITR | This is a system-generated report`,
            pageWidth / 2,
            doc.internal.pageSize.getHeight() - 10,
            { align: 'center' }
        );
    }

    // ============ DISCLAIMER (Last Page) ============
    doc.setPage(pageCount);
    const disclaimerY = doc.internal.pageSize.getHeight() - 40;

    doc.setFillColor(254, 226, 226); // Red-100
    doc.rect(10, disclaimerY - 5, pageWidth - 20, 25, 'F');

    doc.setTextColor(153, 27, 27); // Red-800
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('DISCLAIMER:', 14, disclaimerY + 3);
    doc.setFont('helvetica', 'normal');
    doc.text('This report is for informational purposes only. Please consult a qualified Chartered Accountant before filing your ITR.', 14, disclaimerY + 10);
    doc.text('Tax calculations are based on available data and may require verification. EasyITR is not liable for any discrepancies.', 14, disclaimerY + 16);

    // Save the PDF
    doc.save(`CryptoTaxReport_${data.financialYear.replace('-', '_')}_${data.user.pan}.pdf`);
}

/**
 * Generate Schedule VDA Only (ITR-ready format)
 */
export function generateScheduleVDAPDF(data: TaxReportData): void {
    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();

    const primaryColor: [number, number, number] = [79, 70, 229];
    const darkColor: [number, number, number] = [15, 23, 42];

    // Header
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 30, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('SCHEDULE VDA', pageWidth / 2, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.text('Statement of Income from Transfer of Virtual Digital Assets u/s 115BBH', pageWidth / 2, 24, { align: 'center' });

    // User info
    doc.setTextColor(...darkColor);
    doc.setFontSize(10);
    doc.text(`Name: ${data.user.name} | PAN: ${data.user.pan} | AY: ${data.assessmentYear}`, 14, 40);

    // Table
    if (data.scheduleVDA.length > 0) {
        autoTable(doc, {
            startY: 50,
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
                row.saleConsideration.toLocaleString('en-IN'),
                row.costOfAcquisition.toLocaleString('en-IN'),
                row.gainLoss >= 0 ? row.gainLoss.toLocaleString('en-IN') : `(${Math.abs(row.gainLoss).toLocaleString('en-IN')})`
            ]),
            foot: [[
                '',
                '',
                '',
                'TOTAL',
                data.scheduleVDA.reduce((sum, r) => sum + r.saleConsideration, 0).toLocaleString('en-IN'),
                data.scheduleVDA.reduce((sum, r) => sum + r.costOfAcquisition, 0).toLocaleString('en-IN'),
                data.scheduleVDA.reduce((sum, r) => sum + r.gainLoss, 0).toLocaleString('en-IN')
            ]],
            theme: 'grid',
            headStyles: {
                fillColor: primaryColor,
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 9,
                halign: 'center',
                valign: 'middle'
            },
            bodyStyles: {
                fontSize: 9,
                textColor: darkColor,
                valign: 'middle'
            },
            footStyles: {
                fillColor: [226, 232, 240],
                textColor: darkColor,
                fontStyle: 'bold',
                fontSize: 9
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

    // Footer
    const footerY = doc.internal.pageSize.getHeight() - 15;
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('This Schedule VDA is generated for ITR filing purposes. Verify data with Form 26AS and AIS before submission.', pageWidth / 2, footerY, { align: 'center' });

    doc.save(`ScheduleVDA_${data.assessmentYear}_${data.user.pan}.pdf`);
}

/**
 * Generate FIFO Audit Trail PDF
 */
export function generateFIFOAuditTrailPDF(
    data: TaxReportData,
    fifoMatches: { sellDate: string; token: string; sellQty: number; sellPrice: number; buyDate: string; buyPrice: number; gain: number }[]
): void {
    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();

    const primaryColor: [number, number, number] = [79, 70, 229];
    const darkColor: [number, number, number] = [15, 23, 42];

    // Header
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 25, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('FIFO AUDIT TRAIL - Lot Matching Details', pageWidth / 2, 15, { align: 'center' });

    doc.setTextColor(...darkColor);
    doc.setFontSize(10);
    doc.text(`PAN: ${data.user.pan} | FY: ${data.financialYear}`, 14, 35);

    // Table
    if (fifoMatches.length > 0) {
        autoTable(doc, {
            startY: 45,
            head: [['Sale Date', 'Token', 'Qty Sold', 'Sale Price (INR)', 'Buy Date (FIFO)', 'Buy Price (INR)', 'Gain/Loss (INR)']],
            body: fifoMatches.map(m => [
                m.sellDate,
                m.token,
                Number(m.sellQty || 0).toFixed(6),
                m.sellPrice.toLocaleString('en-IN'),
                m.buyDate,
                m.buyPrice.toLocaleString('en-IN'),
                m.gain >= 0 ? m.gain.toLocaleString('en-IN') : `(${Math.abs(m.gain).toLocaleString('en-IN')})`
            ]),
            theme: 'striped',
            headStyles: {
                fillColor: primaryColor,
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 9
            },
            bodyStyles: {
                fontSize: 9,
                textColor: darkColor
            },
            margin: { left: 10, right: 10 }
        });
    }

    doc.save(`FIFO_AuditTrail_${data.financialYear.replace('-', '_')}_${data.user.pan}.pdf`);
}

