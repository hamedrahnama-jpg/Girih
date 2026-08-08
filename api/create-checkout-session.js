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
    if (!process.env.STRIPE_PRICE_ID) throw new Error('Missing required environment variable: STRIPE_PRICE_ID');
    if (profile.role === 'paid' && profile.stripe_customer_id) {
      throw httpError(409, 'You already have paid access. Open Billing to manage it.');
    }

    let customerId = profile.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: profile.full_name || undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      const { error } = await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;
    }

    const origin = requestOrigin(req);
    const checkout = await stripe.checkout.sessions.create({
      customer: customerId,
      client_reference_id: user.id,
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${origin}/app?checkout=success`,
      cancel_url: `${origin}/app?checkout=cancelled`,
      metadata: { supabase_user_id: user.id },
      subscription_data: { metadata: { supabase_user_id: user.id } },
    });
    res.status(200).json({ url: checkout.url });
  } catch (error) {
    sendError(res, error);
  }
}
