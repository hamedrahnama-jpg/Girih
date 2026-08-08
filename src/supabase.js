import { createClient } from '@supabase/supabase-js';

const projectRef = 'csewcdonvgbqzfuwvqdo';
const fallbackUrl = `https://${projectRef}.supabase.co`;
const fallbackPublishableKey = 'sb_publishable_puyfIdHHvH7CO2DIlibHkQ_Hcvl4tUb';
const configuredUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/^['"]|['"]$/g, '');
const configuredForSharedProject = configuredUrl.includes(`${projectRef}.supabase.co`);
const supabaseUrl = configuredForSharedProject ? configuredUrl : fallbackUrl;
const supabasePublishableKey = configuredForSharedProject
  ? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || fallbackPublishableKey
  : fallbackPublishableKey;
const authStorageKey = 'girihstudio-supabase-auth';

function migrateSupabaseAuthStorage() {
  if (typeof localStorage === 'undefined') return;
  try {
    const legacyKeys = [`sb-${projectRef}-auth-token`, 'mehraz-supabase-auth', 'muqarnas-supabase-auth'];
    const existing = localStorage.getItem(authStorageKey);
    const legacy = legacyKeys.map((key) => localStorage.getItem(key)).find(Boolean);
    if (!existing && legacy) localStorage.setItem(authStorageKey, legacy);
  } catch {
    // Storage can be unavailable in privacy modes; Supabase will still work in memory.
  }
}

export const supabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

if (supabaseConfigured) migrateSupabaseAuthStorage();

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        storageKey: authStorageKey,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null;

export async function loadAuthenticatedUser(user) {
  if (!supabase || !user) return null;
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;
  return {
    id: user.id,
    email: user.email || '',
    name: profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Girih user',
    role: profile?.role || 'free',
    accountType: profile?.account_type || 'individual',
    subscriptionStatus: profile?.subscription_status || 'inactive',
    hasBillingAccount: Boolean(profile?.stripe_customer_id),
  };
}
