import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL) {
    throw new Error('Missing required environment variable: SUPABASE_URL. Please set it in your .env file.');
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY. Please set it in your .env file.');
}
/**
 * Supabase client using service role key.
 * This client has admin privileges and should NEVER be exposed to the frontend.
 * Only use this client in server-side code.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});
