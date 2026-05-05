// Supabase Configuration
// Replace these with your actual Supabase project credentials

const SUPABASE_CONFIG = {
  url: 'YOUR_SUPABASE_URL', // e.g., https://xxxxx.supabase.co
  anonKey: 'YOUR_SUPABASE_ANON_KEY'
};

// Initialize Supabase client (loaded from CDN in HTML)
let supabase;

async function initSupabase() {
  if (typeof supabase === 'undefined' && window.supabase) {
    // Try to fetch public config from backend (anon key + url)
    try {
      const resp = await fetch('/public-config');
      if (resp.ok) {
        const cfg = await resp.json();
        if (cfg.url) SUPABASE_CONFIG.url = cfg.url;
        if (cfg.anonKey) SUPABASE_CONFIG.anonKey = cfg.anonKey;
      } else {
        console.warn('Could not load public config, falling back to local values');
      }
    } catch (e) {
      console.warn('Failed to fetch public config:', e);
    }

    supabase = window.supabase.createClient(
      SUPABASE_CONFIG.url,
      SUPABASE_CONFIG.anonKey
    );
    console.log('Supabase client initialized');
  }
  return supabase;
}

