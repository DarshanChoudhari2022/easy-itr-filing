/**
 * Vite Plugin: Local API Proxy for Vercel Serverless Functions
 * 
 * Intercepts local API requests during dev and routes them to the
 * actual Vercel serverless function handlers.
 */
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export function vercelApiPlugin(): Plugin {
    return {
        name: 'vercel-api-proxy',
        configureServer(server) {
            // Load .env into process.env for serverless functions
            try {
                const envPath = resolve(process.cwd(), '.env');
                const envContent = readFileSync(envPath, 'utf-8');
                for (const line of envContent.split('\n')) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith('#')) continue;
                    const eqIdx = trimmed.indexOf('=');
                    if (eqIdx === -1) continue;
                    const key = trimmed.slice(0, eqIdx).trim();
                    let val = trimmed.slice(eqIdx + 1).trim();
                    // Remove surrounding quotes
                    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                        val = val.slice(1, -1);
                    }
                    if (!process.env[key]) {
                        process.env[key] = val;
                    }
                }
                // Also set non-VITE_ aliases that serverless functions check
                if (!process.env.SUPABASE_URL) process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
                if (!process.env.SUPABASE_ANON_KEY) process.env.SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
                console.log('[API Plugin] Loaded .env, SUPABASE_URL =', process.env.SUPABASE_URL?.slice(0, 30) + '...');
            } catch (e) {
                console.warn('[API Plugin] Could not load .env:', (e as Error).message);
            }

            server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
                const url = req.url || '';

                // Only handle known local API routes.
                if (!url.startsWith('/api/crypto/') && !url.startsWith('/api/coindcx-proxy')) {
                    return next();
                }

                try {
                    // Parse the body for POST requests
                    let body: any = undefined;
                    if (req.method === 'POST') {
                        body = await readBody(req);
                    }

                    // Parse URL and query params
                    const parsedUrl = new URL(url, `http://${req.headers.host || 'localhost'}`);
                    const query: Record<string, string | string[]> = {};
                    parsedUrl.searchParams.forEach((value, key) => {
                        query[key] = value;
                    });

                    // Map URL to handler file
                    const pathAfterCrypto = url.replace('/api/crypto/', '').split('?')[0];
                    let handlerPath: string;

                    // Route mapping
                    if (url.startsWith('/api/coindcx-proxy')) {
                        handlerPath = './api/coindcx-proxy.ts';
                    } else if (pathAfterCrypto === 'upload/order-history') {
                        handlerPath = './api/crypto/upload/order-history.ts';
                    } else if (pathAfterCrypto === 'upload/insta-history') {
                        handlerPath = './api/crypto/upload/insta-history.ts';
                    } else if (pathAfterCrypto === 'upload/tds-summary') {
                        handlerPath = './api/crypto/upload/tds-summary.ts';
                    } else if (pathAfterCrypto === 'available-years') {
                        handlerPath = './api/crypto/available-years.ts';
                    } else if (pathAfterCrypto === 'overview') {
                        handlerPath = './api/crypto/overview.ts';
                    } else if (pathAfterCrypto === 'transactions') {
                        handlerPath = './api/crypto/transactions.ts';
                    } else if (pathAfterCrypto === 'compute-tax') {
                        handlerPath = './api/crypto/compute-tax.ts';
                    } else if (pathAfterCrypto === 'check-data-quality') {
                        handlerPath = './api/crypto/check-data-quality.ts';
                    } else if (pathAfterCrypto === 'tax-drilldown') {
                        handlerPath = './api/crypto/tax-drilldown.ts';
                    } else if (pathAfterCrypto === 'schedule-vda') {
                        handlerPath = './api/crypto/schedule-vda.ts';
                    } else {
                        res.statusCode = 404;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ success: false, error: `Unknown API route: ${pathAfterCrypto}` }));
                        return;
                    }

                    // Dynamically import the handler
                    const mod = await server.ssrLoadModule(handlerPath);
                    const handler = mod.default;

                    if (typeof handler !== 'function') {
                        res.statusCode = 500;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ success: false, error: 'Handler not found' }));
                        return;
                    }

                    // Create mock VercelRequest and VercelResponse
                    const mockReq = {
                        method: req.method,
                        headers: req.headers,
                        query,
                        body: body,
                        url: url,
                    };

                    const mockRes = createMockResponse(res);

                    await handler(mockReq, mockRes);
                } catch (err) {
                    console.error('[API Plugin] Error:', err);
                    if (!res.headersSent) {
                        res.statusCode = 500;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({
                            success: false,
                            error: (err as Error).message || 'Internal server error',
                        }));
                    }
                }
            });
        },
    };
}

function readBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8');
            if (!raw) {
                resolve(undefined);
                return;
            }
            try {
                resolve(JSON.parse(raw));
            } catch {
                resolve(raw);
            }
        });
        req.on('error', reject);
    });
}

function createMockResponse(res: ServerResponse) {
    let statusCode = 200;
    const headers: Record<string, string> = {};

    return {
        status(code: number) {
            statusCode = code;
            return this;
        },
        setHeader(key: string, value: string) {
            headers[key] = value;
            res.setHeader(key, value);
            return this;
        },
        json(data: any) {
            res.statusCode = statusCode;
            res.setHeader('Content-Type', 'application/json');
            for (const [k, v] of Object.entries(headers)) {
                res.setHeader(k, v);
            }
            res.end(JSON.stringify(data));
            return this;
        },
        end(data?: string) {
            res.statusCode = statusCode;
            res.end(data);
            return this;
        },
    };
}
