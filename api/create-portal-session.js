import {
  createServerServices,
  getProfile,
  httpError,
  requestOrigin,
  requireAuthenticatedUser,
  sendError,
} from '../server/services.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const { supabase, stripe } = createServerServices();
    const user = await requireAuthenticatedUser(req, supabase);
    const profile = await getProfile(supabase, user.id);
    if (!profile.stripe_customer_id) throw httpError(400, 'No billing account exists for this user.');
    const portal = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${requestOrigin(req)}/app`,
    });
    res.status(200).json({ url: portal.url });
  } catch (error) {
    sendError(res, error);
  }
}
