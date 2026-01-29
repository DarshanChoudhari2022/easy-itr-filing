/**
 * TaxBay AI Service
 * Powered by Hugging Face Inference API
 */

const HF_TOKEN = import.meta.env.VITE_HF_TOKEN;
const MODEL = "mistralai/Mistral-7B-Instruct-v0.2";

export interface AIResponse {
    answer: string;
    error?: string;
}

export async function askTaxGuru(question: string): Promise<AIResponse> {
    if (!HF_TOKEN) {
        return { answer: "AI service not configured. Please add VITE_HF_TOKEN to .env." };
    }

    try {
        const response = await fetch(
            `https://api-inference.huggingface.co/models/${MODEL}`,
            {
                headers: {
                    Authorization: `Bearer ${HF_TOKEN}`,
                    "Content-Type": "application/json",
                },
                method: "POST",
                body: JSON.stringify({
                    inputs: `[INST] You are TaxBay Guru, an AI assistant specializing in Indian Income Tax, GST, and Crypto regulations. Answer the following question accurately and concisely according to the latest Finance Act 2024-25. Question: ${question} [/INST]`,
                    parameters: {
                        max_new_tokens: 500,
                        temperature: 0.7,
                        top_p: 0.95,
                        return_full_text: false,
                    }
                }),
            }
        );

        const result = await response.json();

        if (result.error) {
            throw new Error(result.error);
        }

        // Hugging Face returns an array or single object depending on configuration
        const answer = Array.isArray(result) ? result[0].generated_text : result.generated_text;

        return { answer: answer || "I'm sorry, I couldn't process that. Please try again." };
    } catch (error: any) {
        console.error("AI Service Error:", error);
        return {
            answer: "My brain is a bit foggy right now. Please try again in a moment.",
            error: error.message
        };
    }
}
