import {
  createServerServices,
  findUserIdByCustomer,
  sendError,
  updateSubscriptionProfile,
} from '../server/services.js';

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const { supabase, stripe } = createServerServices();
    const payload = await readRawBody(req);
    const signature = req.headers['stripe-signature'];
    const event = stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      if (session.metadata?.kind === 'marketplace_purchase') {
        const listingId = session.metadata.listing_id;
        const buyerId = session.metadata.buyer_id;
        const sellerId = session.metadata.seller_id;
        const { data: listing, error: listingError } = await supabase
          .from('marketplace_listings')
          .select('price_cents,currency')
          .eq('id', listingId)
          .single();
        if (listingError) throw listingError;
        const { error: purchaseError } = await supabase.rpc('record_marketplace_purchase', {
          purchase_listing: listingId,
          purchase_buyer: buyerId,
          purchase_seller: sellerId,
          purchase_amount: listing.price_cents,
          purchase_currency: listing.currency,
          checkout_session: session.id,
          payment_intent: String(session.payment_intent || ''),
        });
        if (purchaseError) throw purchaseError;
        return res.status(200).json({ received: true });
      }
      const userId = session.metadata?.supabase_user_id || session.metadata?.user_id || session.client_reference_id;
      if (userId && session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        await updateSubscriptionProfile(supabase, userId, {
          stripe_customer_id: String(session.customer),
          stripe_subscription_id: subscription.id,
          subscription_status: subscription.status,
        });
      }
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const userId = subscription.metadata?.supabase_user_id || subscription.metadata?.user_id || await findUserIdByCustomer(supabase, String(subscription.customer));
      if (userId) {
        await updateSubscriptionProfile(supabase, userId, {
          stripe_customer_id: String(subscription.customer),
          stripe_subscription_id: subscription.id,
          subscription_status: subscription.status,
        });
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    if (error?.type === 'StripeSignatureVerificationError') {
      return res.status(400).json({ error: 'Invalid webhook signature.' });
    }
    sendError(res, error);
  }
}
