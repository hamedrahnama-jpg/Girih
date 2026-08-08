import {
  createServerServices,
  getProfile,
  httpError,
  requestOrigin,
  requireAuthenticatedUser,
  sendApiError,
} from '../server/services.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const { supabase, stripe } = createServerServices();
    const user = await requireAuthenticatedUser(req, supabase);
    const buyer = await getProfile(supabase, user.id);
    const listingId = String(req.body?.listingId || '').trim();
    const { data: listing, error } = await supabase
      .from('marketplace_listings')
      .select('id,seller_id,title,description,price_cents,currency,status')
      .eq('id', listingId)
      .eq('status', 'published')
      .maybeSingle();
    if (error) throw error;
    if (!listing) throw httpError(404, 'This marketplace listing is not available.');
    if (listing.seller_id === user.id) throw httpError(409, 'You already own this pattern.');

    const { data: existing, error: existingError } = await supabase
      .from('marketplace_purchases')
      .select('id')
      .eq('listing_id', listing.id)
      .eq('buyer_id', user.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) throw httpError(409, 'This pattern is already in your purchased library.');

    const seller = await getProfile(supabase, listing.seller_id);
    if (!seller.stripe_connect_enabled || !seller.stripe_connect_account_id) {
      throw httpError(409, 'The seller has not completed payout setup.');
    }

    const feePercent = Math.min(50, Math.max(0, Number(process.env.MARKETPLACE_FEE_PERCENT) || 10));
    const applicationFee = Math.round(listing.price_cents * feePercent / 100);
    const origin = requestOrigin(req);
    const checkout = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: buyer.stripe_customer_id || undefined,
      customer_email: buyer.stripe_customer_id ? undefined : user.email,
      client_reference_id: user.id,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: listing.currency,
          unit_amount: listing.price_cents,
          product_data: {
            name: listing.title,
            description: String(listing.description || '').slice(0, 500) || 'Girih Studio marketplace pattern',
          },
        },
      }],
      payment_intent_data: {
        application_fee_amount: applicationFee,
        transfer_data: { destination: seller.stripe_connect_account_id },
        metadata: {
          kind: 'marketplace_purchase',
          listing_id: listing.id,
          buyer_id: user.id,
          seller_id: listing.seller_id,
        },
      },
      success_url: `${origin}/profile?purchase=success`,
      cancel_url: `${origin}/marketplace?purchase=cancelled`,
      metadata: {
        kind: 'marketplace_purchase',
        listing_id: listing.id,
        buyer_id: user.id,
        seller_id: listing.seller_id,
      },
    });
    return res.status(200).json({ url: checkout.url });
  } catch (error) {
    return sendApiError(res, error, 'Marketplace checkout is unavailable.');
  }
}
