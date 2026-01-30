/**
 * TaxBay Crypto Engine
 * Production-ready logic for Section 115BBH (Indian Income Tax)
 */

export type TransactionType = 'buy' | 'sell' | 'airdrop' | 'staking' | 'gift_received' | 'hard_fork' | 'transfer_in' | 'transfer_out' | 'derivative_gain' | 'derivative_loss';

export interface Transaction {
    id: string;
    type: TransactionType;
    token: string;
    quantity: number;
    pricePerUnit: number;
    date: Date;
    exchange?: string;
    description?: string;
    fee?: number;
    tdsDeducted?: number;
}

export interface MatchedLot {
    buyId: string;
    sellId: string;
    token: string;
    quantity: number;
    buyPrice: number;
    sellPrice: number;
    buyDate: Date;
    sellDate: Date;
    gainLoss: number;
}

export interface GainResult {
    token: string;
    totalGain: number;
    totalLoss: number;
    taxableGain: number; // For India, this is usually totalGain since loss is disallowed
    taxReady: number; // 30% of taxableGain
    matchedLots: MatchedLot[];
    currentHolding: number;
}

export interface TaxSettings {
    accountingMethod: 'FIFO' | 'LIFO' | 'HIFO';
    treatAirdropsAsIncome: boolean;
    treatRewardsAsIncome: boolean;
    treatStakingAsIncome: boolean;
    treatInterestAsIncome: boolean;
    baseCurrency: string;
    country: string;
}

/**
 * Calculates Crypto Gains using FIFO logic for a single token
 * Disallows loss set-off as per Indian IT Act 2022
 */
export function calculateTokenGains(transactions: Transaction[], settings?: TaxSettings): GainResult {
    const sorted = [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());

    const inventory: { id: string; qty: number; cost: number; date: Date }[] = [];
    const matchedLots: MatchedLot[] = [];
    let totalGain = 0;
    let totalLoss = 0;
    let currentHolding = 0;

    for (const tx of sorted) {
        if (['buy', 'airdrop', 'staking', 'gift_received', 'hard_fork', 'transfer_in'].includes(tx.type)) {
            let costBasis = tx.pricePerUnit;

            // Adjust cost basis based on settings (e.g., if already taxed as income, cost basis might be market value)
            if (tx.type === 'airdrop' && settings?.treatAirdropsAsIncome) costBasis = tx.pricePerUnit;
            if (tx.type === 'staking' && settings?.treatStakingAsIncome) costBasis = tx.pricePerUnit;

            inventory.push({ id: tx.id, qty: tx.quantity, cost: costBasis, date: tx.date });
            currentHolding += tx.quantity;
        } else if (tx.type === 'sell' || tx.type === 'transfer_out') {
            let remainingToSell = tx.quantity;
            const salePrice = tx.pricePerUnit;
            currentHolding -= tx.quantity;

            while (remainingToSell > 0 && inventory.length > 0) {
                // Determine which lot to pick based on accounting method
                let lotIndex = 0;
                if (settings?.accountingMethod === 'LIFO') lotIndex = inventory.length - 1;
                if (settings?.accountingMethod === 'HIFO') {
                    lotIndex = inventory.reduce((maxIdx, current, idx, arr) =>
                        current.cost > arr[maxIdx].cost ? idx : maxIdx, 0);
                }

                const lot = inventory[lotIndex];
                const matchedQty = Math.min(lot.qty, remainingToSell);

                const gain = matchedQty * (salePrice - lot.cost);

                matchedLots.push({
                    buyId: lot.id,
                    sellId: tx.id,
                    token: tx.token,
                    quantity: matchedQty,
                    buyPrice: lot.cost,
                    sellPrice: salePrice,
                    buyDate: lot.date,
                    sellDate: tx.date,
                    gainLoss: gain
                });

                if (gain > 0) {
                    totalGain += gain;
                } else {
                    totalLoss += Math.abs(gain);
                }

                if (lot.qty <= remainingToSell) {
                    remainingToSell -= lot.qty;
                    inventory.splice(lotIndex, 1);
                } else {
                    lot.qty -= remainingToSell;
                    remainingToSell = 0;
                }
            }
        }
    }

    return {
        token: transactions[0]?.token || 'UNKNOWN',
        totalGain,
        totalLoss,
        taxableGain: totalGain, // Section 115BBH disallows set-off of losses
        taxReady: totalGain * 0.30,
        matchedLots,
        currentHolding
    };
}

/**
 * Summarizes entire portfolio and generates insights
 */
export function calculateDetailedPortfolio(trades: Transaction[], settings: TaxSettings) {
    const tradesByToken: Record<string, Transaction[]> = {};
    trades.forEach(t => {
        if (!tradesByToken[t.token]) tradesByToken[t.token] = [];
        tradesByToken[t.token].push(t);
    });

    const breakdown: GainResult[] = [];
    let totalTaxable = 0;
    let totalOtherIncome = 0; // Staking, Airdrops etc. if treated as income

    // Process capital gains per token
    for (const token in tradesByToken) {
        const res = calculateTokenGains(tradesByToken[token], settings);
        breakdown.push(res);
        totalTaxable += res.taxableGain;
    }

    // Calculate "Other Income" (Airdrops, Staking etc if settings say so)
    if (settings.treatAirdropsAsIncome || settings.treatRewardsAsIncome) {
        trades.forEach(t => {
            if (t.type === 'airdrop' && settings.treatAirdropsAsIncome) totalOtherIncome += t.quantity * t.pricePerUnit;
            if (t.type === 'staking' && settings.treatStakingAsIncome) totalOtherIncome += t.quantity * t.pricePerUnit;
        });
    }

    // Monthly Gains/Losses
    const monthlyData: Record<string, { gain: number; loss: number }> = {};
    breakdown.forEach(res => {
        res.matchedLots.forEach(lot => {
            const month = lot.sellDate.toLocaleString('default', { month: 'short', year: '2-digit' });
            if (!monthlyData[month]) monthlyData[month] = { gain: 0, loss: 0 };
            if (lot.gainLoss > 0) monthlyData[month].gain += lot.gainLoss;
            else monthlyData[month].loss += Math.abs(lot.gainLoss);
        });
    });

    const monthlyArray = Object.entries(monthlyData).map(([name, data]) => ({
        name,
        gain: data.gain,
        loss: data.loss
    }));

    return {
        breakdown,
        totalTaxable,
        totalOtherIncome,
        totalTaxDue: (totalTaxable * 0.30) + (totalOtherIncome * 0.20), // Simplified tax logic for other income
        monthlyArray,
        tokenWise: breakdown.map(b => ({ name: b.token, gain: b.totalGain, loss: b.totalLoss }))
    };
}
