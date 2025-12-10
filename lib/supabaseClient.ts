// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// .env.local の URL / KEY を使ってクライアントを作成
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
