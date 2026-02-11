/**
 * TaxMitra AI Service — Enhanced with User Context
 * Powered by Hugging Face Inference API
 * 
 * Features:
 * - Context-aware prompts injected with user's income profile
 * - Intent detection for common tax queries
 * - Guardrails and disclaimers
 * - Rate limiting tracking
 */

const HF_TOKEN = import.meta.env.VITE_HF_TOKEN;
const MODEL = "mistralai/Mistral-7B-Instruct-v0.2";

export interface AIResponse {
    answer: string;
    error?: string;
    intent?: string;
    disclaimer?: string;
}

export interface UserTaxContext {
    assessmentYear?: string;
    regime?: 'old' | 'new';
    grossIncome?: number;
    incomeSources?: string[];
    totalDeductions?: number;
    hasCrypto?: boolean;
    cryptoGains?: number;
    itrForm?: string;
    totalTax?: number;
    refundOrDue?: number;
    isRefund?: boolean;
    plan?: string;
}

// Common intents for faster routing
type Intent = 'tax_summary' | 'regime_help' | 'crypto_explain' | 'deduction_help' |
    'filing_help' | 'ais_help' | 'general';

function detectIntent(question: string): Intent {
    const q = question.toLowerCase();

    if (q.includes('summary') || q.includes('my tax') || q.includes('how much tax') || q.includes('total tax')) {
        return 'tax_summary';
    }
    if (q.includes('regime') || q.includes('old vs new') || q.includes('which regime') || q.includes('old or new')) {
        return 'regime_help';
    }
    if (q.includes('crypto') || q.includes('bitcoin') || q.includes('vda') || q.includes('schedule vda') || q.includes('115bbh')) {
        return 'crypto_explain';
    }
    if (q.includes('deduction') || q.includes('80c') || q.includes('80d') || q.includes('save tax') || q.includes('tax saving')) {
        return 'deduction_help';
    }
    if (q.includes('file') || q.includes('itr') || q.includes('return') || q.includes('form') || q.includes('json')) {
        return 'filing_help';
    }
    if (q.includes('ais') || q.includes('tis') || q.includes('26as') || q.includes('mismatch') || q.includes('reconcil')) {
        return 'ais_help';
    }
    return 'general';
}

function buildContextPrompt(question: string, context?: UserTaxContext): string {
    let contextBlock = '';

    if (context) {
        const parts: string[] = [];

        if (context.assessmentYear) parts.push(`Assessment Year: ${context.assessmentYear}`);
        if (context.regime) parts.push(`Selected Regime: ${context.regime === 'old' ? 'Old' : 'New'} Regime`);
        if (context.grossIncome) parts.push(`Gross Income: ₹${context.grossIncome.toLocaleString('en-IN')}`);
        if (context.incomeSources?.length) parts.push(`Income Sources: ${context.incomeSources.join(', ')}`);
        if (context.totalDeductions) parts.push(`Total Deductions: ₹${context.totalDeductions.toLocaleString('en-IN')}`);
        if (context.hasCrypto) parts.push(`Has Crypto/VDA Income: Yes`);
        if (context.cryptoGains) parts.push(`Crypto Gains: ₹${context.cryptoGains.toLocaleString('en-IN')}`);
        if (context.itrForm) parts.push(`ITR Form: ${context.itrForm}`);
        if (context.totalTax) parts.push(`Computed Tax: ₹${context.totalTax.toLocaleString('en-IN')}`);
        if (context.refundOrDue !== undefined) {
            parts.push(`${context.isRefund ? 'Refund' : 'Tax Due'}: ₹${context.refundOrDue.toLocaleString('en-IN')}`);
        }

        if (parts.length > 0) {
            contextBlock = `\n\nUSER'S TAX PROFILE:\n${parts.join('\n')}`;
        }
    }

    return `[INST] You are TaxMitra Guru, an expert AI assistant for Indian Income Tax, GST, and Crypto/VDA tax regulations.

IMPORTANT RULES:
1. Answer based on the latest Indian tax laws (Finance Act 2024 and Budget 2025).
2. When citing tax rules, mention the specific section (e.g., "Section 80C", "Section 115BBH").
3. Never guarantee specific refund amounts or promise regulatory outcomes.
4. For complex or high-stakes situations, advise consulting a qualified Chartered Accountant.
5. Keep answers concise (under 300 words) and use bullet points where helpful.
6. When the user has a tax profile, personalize your answer using their data.
7. Always provide INR amounts in Indian numbering format (e.g., ₹1,50,000).${contextBlock}

QUESTION: ${question} [/INST]`;
}

const DISCLAIMER = '⚠️ This is AI-generated guidance based on general tax rules. It is not legal or tax advice. Please consult a qualified CA for your specific situation.';

export async function askTaxGuru(
    question: string,
    context?: UserTaxContext
): Promise<AIResponse> {
    if (!HF_TOKEN) {
        return {
            answer: "AI service not configured. Please add VITE_HF_TOKEN to your environment variables.",
            error: "Missing API token"
        };
    }

    if (!question || question.trim().length < 3) {
        return {
            answer: "Please ask a more specific question. For example: 'Which regime is better for me?' or 'How is crypto taxed in India?'",
        };
    }

    const intent = detectIntent(question);

    try {
        const prompt = buildContextPrompt(question, context);

        const response = await fetch(
            `https://api-inference.huggingface.co/models/${MODEL}`,
            {
                headers: {
                    Authorization: `Bearer ${HF_TOKEN}`,
                    "Content-Type": "application/json",
                },
                method: "POST",
                body: JSON.stringify({
                    inputs: prompt,
                    parameters: {
                        max_new_tokens: 500,
                        temperature: 0.6, // Slightly lower for more factual answers
                        top_p: 0.92,
                        return_full_text: false,
                        repetition_penalty: 1.1,
                    }
                }),
            }
        );

        if (!response.ok) {
            if (response.status === 503) {
                return {
                    answer: "The AI model is currently loading. Please try again in 20-30 seconds.",
                    error: "Model loading",
                    intent,
                };
            }
            throw new Error(`API returned ${response.status}`);
        }

        const result = await response.json();

        if (result.error) {
            throw new Error(result.error);
        }

        const rawAnswer = Array.isArray(result)
            ? result[0]?.generated_text
            : result.generated_text;

        if (!rawAnswer) {
            return {
                answer: "I couldn't generate a response. Please try rephrasing your question.",
                intent,
            };
        }

        // Clean up the response
        const cleanAnswer = rawAnswer
            .trim()
            .replace(/\[\/INST\]/g, '')
            .replace(/\[INST\]/g, '')
            .trim();

        return {
            answer: cleanAnswer,
            intent,
            disclaimer: DISCLAIMER,
        };

    } catch (error) {
        const err = error as Error;
        console.error("TaxMitra AI Error:", err);

        // Provide fallback answers for common intents
        const fallbacks: Partial<Record<Intent, string>> = {
            crypto_explain: "**Crypto/VDA Taxation in India:**\n\n• All gains from crypto are taxed at **30% flat** (Section 115BBH)\n• **No deduction** is allowed except cost of acquisition\n• **Losses cannot be set off** against any other income, including other crypto\n• **1% TDS** (Section 194S) on transfers above ₹50,000/year\n• Report in **Schedule VDA** of your ITR\n\nPlease try your question again shortly for a more detailed answer.",
            regime_help: "**Choosing between Old and New Regime:**\n\n• **New Regime** (default from AY 2024-25): Lower slab rates, ₹75K standard deduction, rebate up to ₹12L income (AY 2026-27). Best if deductions < ₹3.75L.\n• **Old Regime**: Higher rates but allows 80C, 80D, HRA, LTA deductions. Best if deductions > ₹3.75L.\n\nUse our Regime Comparison tool for an exact calculation!",
            deduction_help: "**Key Tax Deductions (Old Regime):**\n\n• **80C**: ₹1.5L — EPF, PPF, ELSS, LIC, NSC, home loan principal\n• **80D**: ₹25K (₹50K for seniors) — Health insurance\n• **80CCD(1B)**: ₹50K extra — NPS contributions\n• **80TTA**: ₹10K — Savings interest\n• **80E**: No limit — Education loan interest\n• **24(b)**: ₹2L — Home loan interest\n\nPlease try again for personalized suggestions.",
        };

        return {
            answer: fallbacks[intent] || "I'm having trouble connecting right now. Please try again in a moment.",
            error: err.message,
            intent,
            disclaimer: DISCLAIMER,
        };
    }
}
