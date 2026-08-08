import {
  createServerServices,
  getProfile,
  requestOrigin,
  requireAuthenticatedUser,
  sendApiError,
} from '../server/services.js';

function sellerSetupError(error) {
  const message = String(error?.message || '');
  if (error?.type?.startsWith?.('Stripe')) {
    if (/signed up for connect|connect.*platform|platform profile/i.test(message)) {
      return Object.assign(new Error('Stripe Connect is not enabled for this Stripe account. Open Stripe Dashboard, complete Connect platform setup, then try again.'), { status: 409 });
    }
    if (/country|capabilit|express/i.test(message)) {
      return Object.assign(new Error(`Stripe could not create this seller account: ${message}`), { status: 409 });
    }
    return Object.assign(new Error(`Stripe seller setup failed: ${message}`), { status: 400 });
  }
  if (/stripe_connect_account_id|column .* does not exist/i.test(message)) {
    return Object.assign(new Error('Marketplace database fields are missing. Run the latest supabase/schema.sql, then try again.'), { status: 409 });
  }
  return error;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const { supabase, stripe } = createServerServices();
    const user = await requireAuthenticatedUser(req, supabase);
    const profile = await getProfile(supabase, user.id);
    let accountId = profile.stripe_connect_account_id;
    if (req.query?.mode === 'dashboard') {
      if (!accountId) {
        return res.status(409).json({ error: 'Complete Stripe seller setup before opening payouts.' });
      }
      const loginLink = await stripe.accounts.createLoginLink(accountId);
      return res.status(200).json({ url: loginLink.url });
    }
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: user.email,
        capabilities: {
          transfers: { requested: true },
        },
        business_type: 'individual',
        metadata: { supabase_user_id: user.id },
      });
      accountId = account.id;
      const { error } = await supabase
        .from('profiles')
        .update({ stripe_connect_account_id: accountId, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;
    }

    const origin = requestOrigin(req);
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/profile?seller=refresh`,
      return_url: `${origin}/profile?seller=return`,
      type: 'account_onboarding',
    });
    return res.status(200).json({ url: link.url });
  } catch (error) {
    return sendApiError(res, sellerSetupError(error), 'Seller payout setup is unavailable.');
  }
}
