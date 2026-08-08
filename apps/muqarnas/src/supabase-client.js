import { createClient } from '@supabase/supabase-js';

const projectRef = 'csewcdonvgbqzfuwvqdo';
const fallbackUrl = `https://${projectRef}.supabase.co`;
const fallbackPublishableKey = 'sb_publishable_puyfIdHHvH7CO2DIlibHkQ_Hcvl4tUb';
const configuredUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/^['"]|['"]$/g, '');
const configuredForSharedProject = configuredUrl.includes(`${projectRef}.supabase.co`);
const supabaseUrl = configuredForSharedProject ? configuredUrl : fallbackUrl;
const supabasePublishableKey = String(configuredForSharedProject
  ? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || fallbackPublishableKey
  : fallbackPublishableKey).trim();

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storageKey: 'girihstudio-supabase-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

async function consumeAuthHandoff() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get('girih_access_token');
  const refreshToken = params.get('girih_refresh_token');
  if (!accessToken || !refreshToken) return;
  window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
  const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) throw error;
}

export const authHandoffReady = consumeAuthHandoff();
