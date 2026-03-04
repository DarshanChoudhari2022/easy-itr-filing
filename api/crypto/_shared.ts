/**
 * Shared utilities for crypto API endpoints.
 * Auth helper, CORS, FY validation — used by all /api/crypto/* handlers.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface AuthContext {
    userId: string;
    supabase: SupabaseClient;
}

/**
 * Set CORS headers on the response.
 */
export function setCORS(res: VercelResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Authenticate the request using the Bearer JWT token.
 * Returns { userId, supabase } on success, or sends a 401 error response.
 */
export async function authenticate(
    req: VercelRequest,
    res: VercelResponse,
): Promise<AuthContext | null> {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: 'Missing Authorization header' });
        return null;
    }

    const token = authHeader.slice(7);
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const supabaseAnonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
        res.status(401).json({ success: false, error: 'Invalid or expired token' });
        return null;
    }

    // Return user-scoped client for RLS compliance
    const dbClient = supabaseServiceKey
        ? supabase
        : createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: `Bearer ${token}` } },
        });

    return { userId: user.id, supabase: dbClient };
}

/**
 * Parse and validate the `fy` query parameter.
 * Returns the financial year string (e.g. 'FY2024-25') or sends a 400 error.
 */
export function parseFY(
    req: VercelRequest,
    res: VercelResponse,
): string | null {
    const fy = (req.query.fy as string) || '';
    if (!fy || !fy.match(/^FY\d{4}-\d{2}$/)) {
        res.status(400).json({
            success: false,
            error: 'Missing or invalid fy query parameter. Expected format: FY2024-25',
        });
        return null;
    }
    return fy;
}
