/**
 * Vercel Serverless Function — CoinDCX API Proxy
 * 
 * Runs on YOUR Vercel server (same domain), so no CORS issues.
 * The browser sends { endpoint, body, apiKey, apiSecret } to this function.
 * This function signs the request with HMAC-SHA256 and forwards it to CoinDCX.
 * 
 * Security: API keys are transmitted over HTTPS to your own server only.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

const COINDCX_API_BASE = 'https://api.coindcx.com';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Set CORS headers for your domain
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { endpoint, body, apiKey, apiSecret } = req.body;

        if (!endpoint || !apiKey || !apiSecret) {
            return res.status(400).json({
                error: 'Missing required fields: endpoint, apiKey, apiSecret'
            });
        }

        // Generate HMAC-SHA256 signature
        const payload = JSON.stringify(body || {});
        const signature = crypto
            .createHmac('sha256', apiSecret)
            .update(payload)
            .digest('hex');

        // Forward request to CoinDCX
        const url = `${COINDCX_API_BASE}${endpoint}`;
        console.log(`[CoinDCX Proxy] ${req.method} ${endpoint}`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-AUTH-APIKEY': apiKey,
                'X-AUTH-SIGNATURE': signature,
            },
            body: payload,
        });

        const responseText = await response.text();

        // Try to parse as JSON
        let responseData;
        try {
            responseData = JSON.parse(responseText);
        } catch {
            responseData = responseText;
        }

        // Detailed diagnostic logging
        const isArray = Array.isArray(responseData);
        const summary = isArray
            ? `array[${responseData.length}]`
            : typeof responseData === 'object'
                ? `object{${Object.keys(responseData).join(',')}}`
                : typeof responseData;
        console.log(`[CoinDCX Proxy] ${endpoint} → ${response.status} → ${summary}`);

        if (!response.ok) {
            console.error(`[CoinDCX Proxy] Error ${response.status}:`, responseText.substring(0, 500));
            return res.status(response.status).json({
                error: `CoinDCX API Error (${response.status})`,
                details: responseData,
            });
        }

        return res.status(200).json(responseData);
    } catch (error) {
        console.error('[CoinDCX Proxy] Error:', error);
        return res.status(500).json({
            error: 'Proxy server error',
            message: (error as Error).message,
        });
    }
}
