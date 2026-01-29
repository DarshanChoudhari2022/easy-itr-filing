/**
 * TaxBay Crypto Engine
 * Production-ready logic for Section 115BBH (Indian Income Tax)
 */

export interface Transaction {
    id: string;
    type: 'buy' | 'sell';
    token: string;
    quantity: number;
    pricePerUnit: number;
    date: Date;
}

export interface GainResult {
    token: string;
    totalGain: number;
    totalLoss: number;
    taxableGain: number; // For India, this is usually totalGain since loss is disallowed
    taxReady: number; // 30% of taxableGain
}

/**
 * Calculates Crypto Gains using FIFO logic for a single token
 * Disallows loss set-off as per Indian IT Act 2022
 */
export function calculateTokenGains(transactions: Transaction[]): GainResult {
    const sorted = [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());

    let inventory: { qty: number; cost: number }[] = [];
    let totalGain = 0;
    let totalLoss = 0;

    for (const tx of sorted) {
        if (tx.type === 'buy') {
            inventory.push({ qty: tx.quantity, cost: tx.pricePerUnit });
        } else {
            let remainingToSell = tx.quantity;
            let saleProceeds = tx.quantity * tx.pricePerUnit;
            let costBasis = 0;

            while (remainingToSell > 0 && inventory.length > 0) {
                const lot = inventory[0];
                if (lot.qty <= remainingToSell) {
                    costBasis += lot.qty * lot.cost;
                    remainingToSell -= lot.qty;
                    inventory.shift();
                } else {
                    costBasis += remainingToSell * lot.cost;
                    lot.qty -= remainingToSell;
                    remainingToSell = 0;
                }
            }

            const profit = saleProceeds - costBasis;
            if (profit > 0) {
                totalGain += profit;
            } else {
                totalLoss += Math.abs(profit);
            }
        }
    }

    // Section 115BBH: Each VDA is separate. No set-off. 
    // Tax is on gross gains per transaction basically, but cumulative gain per token is often accepted if calculated per year.
    // Actually, disallowance is quite strict.

    return {
        token: transactions[0]?.token || 'UNKNOWN',
        totalGain,
        totalLoss,
        taxableGain: totalGain, // Losses are ignored for tax calculation
        taxReady: totalGain * 0.30
    };
}

/**
 * Summarizes entire portfolio
 */
export function calculatePortfolioTax(tradesByToken: Record<string, Transaction[]>) {
    const results: GainResult[] = [];
    let totalTaxable = 0;

    for (const token in tradesByToken) {
        const res = calculateTokenGains(tradesByToken[token]);
        results.push(res);
        totalTaxable += res.taxableGain;
    }

    return {
        breakdown: results,
        totalTaxable,
        totalTaxDue: totalTaxable * 0.30,
        tdsCredit: 0 // To be filled from 26AS sync
    };
}
