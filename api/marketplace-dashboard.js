import {
  createServerServices,
  getProfile,
  httpError,
  requireAuthenticatedUser,
  sendApiError,
} from '../server/services.js';

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

export default async function handler(req, res) {
  try {
    const { supabase, stripe } = createServerServices();
    const user = await requireAuthenticatedUser(req, supabase);
    let profile = await getProfile(supabase, user.id);

    if (req.method === 'PATCH') {
      const publicName = cleanText(req.body?.publicName, 80);
      const bio = cleanText(req.body?.bio, 500);
      if (publicName.length < 2) throw httpError(400, 'Public name must contain at least two characters.');
      const { error } = await supabase
        .from('profiles')
        .update({ public_name: publicName, bio, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (error) throw error;
      profile = { ...profile, public_name: publicName, bio };
    } else if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    if (profile.stripe_connect_account_id) {
      const account = await stripe.accounts.retrieve(profile.stripe_connect_account_id);
      const enabled = Boolean(account.payouts_enabled && account.capabilities?.transfers === 'active');
      if (enabled !== profile.stripe_connect_enabled) {
        await supabase
          .from('profiles')
          .update({ stripe_connect_enabled: enabled, updated_at: new Date().toISOString() })
          .eq('id', user.id);
        profile = { ...profile, stripe_connect_enabled: enabled };
      }
    }

    const [{ data: listings, error: listingError }, { data: purchases, error: purchaseError }] = await Promise.all([
      supabase
        .from('marketplace_listings')
        .select('id,title,description,category,price_cents,currency,piece_count,preview_image,status,sales_count,created_at')
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('marketplace_purchases')
        .select('id,listing_id,amount_cents,currency,created_at,marketplace_listings(title,category,piece_count,preview_image,model_data)')
        .eq('buyer_id', user.id)
        .order('created_at', { ascending: false }),
    ]);
    if (listingError) throw listingError;
    if (purchaseError) throw purchaseError;

    return res.status(200).json({
      profile: {
        id: profile.id,
        publicName: profile.public_name || profile.full_name || user.email?.split('@')[0] || 'Girih artist',
        bio: profile.bio || '',
        sellerReady: Boolean(profile.stripe_connect_enabled),
      },
      listings: (listings || []).map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description || '',
        category: Number(item.piece_count) === 0 ? 'Stickers' : item.category,
        priceCents: item.price_cents,
        currency: item.currency,
        pieceCount: item.piece_count,
        previewImage: item.preview_image,
        status: item.status,
        salesCount: item.sales_count,
        createdAt: item.created_at,
      })),
      purchases: (purchases || []).map((item) => ({
        id: item.id,
        listingId: item.listing_id,
        amountCents: item.amount_cents,
        currency: item.currency,
        createdAt: item.created_at,
        title: item.marketplace_listings?.title || 'Purchased pattern',
        category: Number(item.marketplace_listings?.piece_count) === 0 ? 'Stickers' : item.marketplace_listings?.category || 'Mixed',
        pieceCount: item.marketplace_listings?.piece_count || 0,
        previewImage: item.marketplace_listings?.preview_image || '',
        modelData: item.marketplace_listings?.model_data || null,
      })),
    });
  } catch (error) {
    return sendApiError(res, error, 'Your marketplace profile is unavailable.');
  }
}
