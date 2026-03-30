import { createClient } from '@supabase/supabase-js';
import { getConfig } from '../config/config';

const config = getConfig();

export const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
    }
});
