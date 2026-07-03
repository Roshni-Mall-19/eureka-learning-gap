// ============================================================
// STEP: Paste your Supabase project details here.
// Find these in Supabase Dashboard -> Project Settings -> API
// ============================================================
const SUPABASE_URL = "https://project-name.supabase.co";
const SUPABASE_ANON_KEY = "Your_Anon_Key";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
