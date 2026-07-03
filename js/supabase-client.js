// ============================================================
// STEP: Paste your Supabase project details here.
// Find these in Supabase Dashboard -> Project Settings -> API
// ============================================================
const SUPABASE_URL = "https://goerhjfqwqnaaivhyjbp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvZXJoamZxd3FuYWFpdmh5amJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwNjkzOTUsImV4cCI6MjA5ODY0NTM5NX0.zXp-AsbGUlUsCUnS22-AW0MA2EpUEtGFJEdutsUnXTY";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
