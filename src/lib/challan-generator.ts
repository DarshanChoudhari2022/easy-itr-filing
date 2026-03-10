/**
 * Challan 280 Generator — Self-Assessment Tax Payment
 * 
 * Generates Challan 280 details for paying income tax due.
 * Includes BSR code entry after payment for ITR attachment.
 */

export interface Challan280Data {
    assessmentYear: string;
    pan: string;
    fullName: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    mobile: string;
    email: string;
    taxType: '0021' | '0020'; // 0021 = Income Tax, 0020 = Corporate
    surchargeType: '300'; // Self-Assessment Tax
    incomeTax: number;
    surcharge: number;
    educationCess: number;
    totalTax: number;
    interestUs234A: number;
    interestUs234B: number;
    interestUs234C: number;
    totalPayable: number;
}

export interface ChallanReceipt {
    bsrCode: string;
    challanDate: string;
    challanSerial: string;
    amount: number;
}

/**
 * Calculate interest for delayed payment under various sections
 */
export function calculateInterest(
    totalTax: number,
    tdsPaid: number,
    advanceTaxPaid: number,
    dueDate: Date,
    filingDate: Date,
): { us234A: number; us234B: number; us234C: number; total: number } {
    const netTax = Math.max(0, totalTax - tdsPaid - advanceTaxPaid);

    // §234A: Late filing interest (1% per month from due date)
    let us234A = 0;
    if (filingDate > dueDate && netTax > 0) {
        const months = Math.ceil((filingDate.getTime() - dueDate.getTime()) / (30 * 24 * 60 * 60 * 1000));
        us234A = Math.round(netTax * 0.01 * months);
    }

    // §234B: Default in advance tax (1% per month if advance tax < 90% of assessed tax)
    let us234B = 0;
    if (advanceTaxPaid < totalTax * 0.9 && totalTax > 10000) {
        const shortfall = totalTax - advanceTaxPaid;
        const monthsFromApril = Math.ceil((filingDate.getTime() - new Date(dueDate.getFullYear(), 3, 1).getTime()) / (30 * 24 * 60 * 60 * 1000));
        us234B = Math.round(shortfall * 0.01 * Math.min(monthsFromApril, 12));
    }

    // §234C: Deferment of advance tax (simplified — 1% for each quarter shortfall)
    const us234C = 0; // Simplified: skip quarterly calc for now

    return { us234A, us234B, us234C, total: us234A + us234B + us234C };
}

/**
 * Generate Challan 280 data from filing session
 */
export function generateChallan280(params: {
    pan: string;
    name: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    mobile: string;
    email: string;
    assessmentYear: string;
    taxPayable: number;
    surcharge: number;
    cess: number;
    tdsPaid: number;
    advanceTaxPaid: number;
}): Challan280Data {
    const interest = calculateInterest(
        params.taxPayable + params.surcharge + params.cess,
        params.tdsPaid,
        params.advanceTaxPaid,
        new Date(2026, 6, 31), // July 31 due date
        new Date(),
    );

    const totalPayable = Math.max(0,
        params.taxPayable + params.surcharge + params.cess +
        interest.total - params.tdsPaid - params.advanceTaxPaid
    );

    return {
        assessmentYear: params.assessmentYear,
        pan: params.pan,
        fullName: params.name,
        address: params.address,
        city: params.city,
        state: params.state,
        pincode: params.pincode,
        mobile: params.mobile,
        email: params.email,
        taxType: '0021',
        surchargeType: '300',
        incomeTax: params.taxPayable,
        surcharge: params.surcharge,
        educationCess: params.cess,
        totalTax: params.taxPayable + params.surcharge + params.cess,
        interestUs234A: interest.us234A,
        interestUs234B: interest.us234B,
        interestUs234C: interest.us234C,
        totalPayable,
    };
}

/**
 * Generate a printable Challan 280 HTML string
 */
export function generateChallanHTML(data: Challan280Data): string {
    return `
<!DOCTYPE html>
<html><head><title>Challan 280 — ${data.pan}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
  .header { text-align: center; border-bottom: 3px solid #1a237e; padding-bottom: 10px; margin-bottom: 20px; }
  .header h1 { color: #1a237e; margin: 0; font-size: 18px; }
  .header h2 { color: #333; margin: 4px 0; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  td, th { border: 1px solid #ccc; padding: 8px 12px; text-align: left; font-size: 13px; }
  th { background: #f5f5f5; font-weight: 600; }
  .amount { text-align: right; font-family: monospace; }
  .total-row { background: #e8eaf6; font-weight: bold; }
  .note { font-size: 11px; color: #666; margin-top: 20px; }
  @media print { body { padding: 0; } }
</style></head>
<body>
  <div class="header">
    <h1>CHALLAN NO. / ITNS 280</h1>
    <h2>Tax Applicable: Income Tax (Other than Companies)</h2>
    <h2>Assessment Year: ${data.assessmentYear}</h2>
  </div>
  <table>
    <tr><th width="40%">PAN</th><td>${data.pan}</td></tr>
    <tr><th>Name</th><td>${data.fullName}</td></tr>
    <tr><th>Address</th><td>${data.address}, ${data.city}, ${data.state} - ${data.pincode}</td></tr>
    <tr><th>Mobile / Email</th><td>${data.mobile} / ${data.email}</td></tr>
    <tr><th>Tax Type Code</th><td>(0021) Income Tax (Other than Companies)</td></tr>
    <tr><th>Type of Payment</th><td>(300) Self-Assessment Tax</td></tr>
  </table>
  <table>
    <tr><th width="60%">Particulars</th><th class="amount">Amount (₹)</th></tr>
    <tr><td>Income Tax</td><td class="amount">${data.incomeTax.toLocaleString('en-IN')}</td></tr>
    <tr><td>Surcharge</td><td class="amount">${data.surcharge.toLocaleString('en-IN')}</td></tr>
    <tr><td>Health & Education Cess</td><td class="amount">${data.educationCess.toLocaleString('en-IN')}</td></tr>
    <tr><td>Interest u/s 234A</td><td class="amount">${data.interestUs234A.toLocaleString('en-IN')}</td></tr>
    <tr><td>Interest u/s 234B</td><td class="amount">${data.interestUs234B.toLocaleString('en-IN')}</td></tr>
    <tr><td>Interest u/s 234C</td><td class="amount">${data.interestUs234C.toLocaleString('en-IN')}</td></tr>
    <tr class="total-row"><td>Total Amount Payable</td><td class="amount">₹ ${data.totalPayable.toLocaleString('en-IN')}</td></tr>
  </table>
  <p class="note">
    <strong>How to pay:</strong><br>
    1. Go to <a href="https://onlineservices.tin.egov-nsdl.com/etaxnew/tdsnontds.jsp">NSDL e-Payment</a><br>
    2. Select Challan No. ITNS 280<br>
    3. Select Tax Type: (0021) Income Tax<br>
    4. Select Payment Type: (300) Self Assessment Tax<br>
    5. Enter PAN: ${data.pan}, Assessment Year: ${data.assessmentYear}<br>
    6. Pay via Net Banking / Debit Card / UPI<br>
    7. After payment, note down the BSR Code, Challan Date, and Serial Number.<br>
    8. Enter these details in TaxMitra to attach to your ITR.
  </p>
</body></html>`;
}

/**
 * Download Challan as HTML file
 */
export function downloadChallanHTML(data: Challan280Data): void {
    const html = generateChallanHTML(data);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Challan_280_${data.pan}_${data.assessmentYear.replace(/\s/g, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
