import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function createServerServices() {
  const supabase = createSupabaseAdmin();
  const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'));
  return { supabase, stripe };
}

export function createSupabaseAdmin() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireAuthenticatedUser(req, supabase) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) throw httpError(401, 'Authentication required.');
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw httpError(401, 'Your session is invalid or expired.');
  return data.user;
}

export async function getProfile(supabase, userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error || !data) throw httpError(404, 'User profile was not found. Run the database setup before using billing.');
  return data;
}

export function requestOrigin(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  return `${protocol}://${host}`;
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function sendError(res, error) {
  const status = Number(error?.status) || 500;
  const message = status >= 500 ? 'The billing service is not configured correctly.' : error.message;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: message });
}

export function sendApiError(res, error, fallback = 'The service could not complete this request.') {
  const status = Number(error?.status) || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: status >= 500 ? fallback : error.message });
}

export async function updateSubscriptionProfile(supabase, userId, fields) {
  const profile = await getProfile(supabase, userId);
  const active = ['active', 'trialing'].includes(fields.subscription_status);
  const role = profile.role === 'admin' ? 'admin' : active ? 'paid' : 'free';
  const { error } = await supabase
    .from('profiles')
    .update({ ...fields, role, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
}

export async function findUserIdByCustomer(supabase, customerId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}
