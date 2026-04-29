/**
 * lib/supabase.js — Supabase Client
 * Guard against missing env during build time
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.warn('[Supabase] Missing env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

// Dummy client saat build time agar tidak crash
// Runtime tetap butuh env yang valid
const DUMMY_URL = 'https://placeholder.supabase.co';
const DUMMY_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.placeholder';

export const supabase = createClient(
  url || DUMMY_URL,
  key || DUMMY_KEY
);
