import {
  createServerServices,
  getProfile,
  httpError,
  requireAuthenticatedUser,
  sendApiError,
} from '../server/services.js';

const CATEGORIES = new Set(['10 Tond', '10 Kond', '8 Morocco', '8 Persian', 'Mixed', 'Stickers']);
const LEGACY_MOROCCO_CATEGORY = '8 Morroco';

function normalizeCategory(value) {
  return value === LEGACY_MOROCCO_CATEGORY ? '8 Morocco' : value;
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function watermarkedStickerPreview(previewImage, sellerName) {
  if (!String(previewImage || '').startsWith('data:image/')) return previewImage;
  const watermark = escapeXml(`© ${sellerName || 'Girih artist'}`);
  const source = escapeXml(previewImage);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
    <defs>
      <pattern id="watermark" width="360" height="150" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)">
        <text x="18" y="82" fill="#23302c" fill-opacity=".28" font-family="Arial,sans-serif" font-size="28" font-weight="700">${watermark}</text>
      </pattern>
    </defs>
    <rect width="1200" height="900" fill="#f7f2e9"/>
    <image href="${source}" x="70" y="55" width="1060" height="790" preserveAspectRatio="xMidYMid meet"/>
    <rect width="1200" height="900" fill="url(#watermark)"/>
    <text x="1160" y="860" text-anchor="end" fill="#23302c" fill-opacity=".58" font-family="Arial,sans-serif" font-size="24" font-weight="700">${watermark}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function publicListing(listing, seller) {
  const isSticker = Number(listing.piece_count) === 0;
  const sellerName = seller?.public_name || seller?.full_name || 'Girih artist';
  return {
    id: listing.id,
    sellerId: listing.seller_id,
    sellerName,
    title: listing.title,
    description: listing.description,
    category: isSticker ? 'Stickers' : normalizeCategory(listing.category),
    priceCents: listing.price_cents,
    currency: listing.currency,
    pieceCount: listing.piece_count,
    previewImage: isSticker ? watermarkedStickerPreview(listing.preview_image, sellerName) : listing.preview_image,
    salesCount: listing.sales_count,
    createdAt: listing.created_at,
  };
}

async function listingCatalog(supabase, query) {
  const requestedLimit = Number.parseInt(cleanText(query.limit, 4), 10);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 100;
  let request = supabase
    .from('marketplace_listings')
    .select('id,seller_id,title,description,category,price_cents,currency,piece_count,preview_image,sales_count,created_at')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(limit);
  const category = normalizeCategory(cleanText(query.category, 40));
  const sellerId = cleanText(query.seller, 80);
  if (category && CATEGORIES.has(category)) {
    if (category === 'Stickers') request = request.eq('piece_count', 0);
    else {
      request = category === '8 Morocco'
        ? request.in('category', [category, LEGACY_MOROCCO_CATEGORY])
        : request.eq('category', category);
    }
  }
  if (sellerId) request = request.eq('seller_id', sellerId);
  const { data: listings, error } = await request;
  if (error) throw error;
  const sellerIds = [...new Set((listings || []).map((item) => item.seller_id))];
  const { data: sellers, error: sellerError } = sellerIds.length
    ? await supabase.from('profiles').select('id,full_name,public_name').in('id', sellerIds)
    : { data: [], error: null };
  if (sellerError) throw sellerError;
  const sellersById = new Map((sellers || []).map((seller) => [seller.id, seller]));
  return (listings || []).map((listing) => publicListing(listing, sellersById.get(listing.seller_id)));
}

export default async function handler(req, res) {
  try {
    const { supabase } = createServerServices();
    if (req.method === 'GET') {
      return res.status(200).json({ listings: await listingCatalog(supabase, req.query || {}) });
    }

    const user = await requireAuthenticatedUser(req, supabase);
    const profile = await getProfile(supabase, user.id);
    if (req.method === 'POST') {
      const body = req.body || {};
      const title = cleanText(body.title, 120);
      const description = cleanText(body.description, 2000);
      const category = normalizeCategory(cleanText(body.category, 40));
      const priceCents = Math.round(Number(body.priceCents));
      const previewImage = String(body.previewImage || '');
      const modelData = body.modelData;
      const isSticker = category === 'Stickers';
      const validStickerPackage = modelData?.kind === 'surface-sticker'
        && typeof modelData?.surfaceSticker?.imageDataUrl === 'string'
        && /^data:image\/(png|webp);base64,/i.test(modelData.surfaceSticker.imageDataUrl);
      const pieceCount = isSticker ? 0 : Array.isArray(modelData?.pieces) ? modelData.pieces.length : 0;
      if (title.length < 2) throw httpError(400, 'Add a title with at least two characters.');
      if (!CATEGORIES.has(category)) throw httpError(400, 'Choose a valid puzzle-set category.');
      if (!Number.isInteger(priceCents) || priceCents < 100) throw httpError(400, 'The minimum listing price is 1.00.');
      if (!previewImage.startsWith('data:image/')) throw httpError(400, 'Generate a valid preview image before listing.');
      if (previewImage.length > 2_500_000) throw httpError(413, 'The preview image is too large.');
      if (isSticker && !validStickerPackage) throw httpError(400, 'Choose a valid PNG surface sticker.');
      if (!isSticker && (!modelData || !Array.isArray(modelData.pieces) || !pieceCount)) throw httpError(400, 'Choose a saved model containing pieces.');
      if (!isSticker && modelData?.kind === 'surface-sticker') throw httpError(400, 'Surface stickers must use the Stickers category.');
      if (JSON.stringify(modelData).length > 5_000_000) throw httpError(413, 'The model is too large for a marketplace listing.');
      if (!profile.stripe_connect_enabled) throw httpError(409, 'Complete seller payout setup before publishing a listing.');

      const listingPayload = {
        seller_id: user.id,
        title,
        description,
        category,
        price_cents: priceCents,
        currency: cleanText(body.currency, 3).toLowerCase() || 'usd',
        piece_count: pieceCount,
        preview_image: previewImage,
        model_data: modelData,
        status: 'published',
      };
      let { data, error } = await supabase
        .from('marketplace_listings')
        .insert(listingPayload)
        .select('id')
        .single();
      if (error?.code === '23514' && category === '8 Morocco') {
        ({ data, error } = await supabase
          .from('marketplace_listings')
          .insert({ ...listingPayload, category: LEGACY_MOROCCO_CATEGORY })
          .select('id')
          .single());
      }
      if (error?.code === '23514' && category === 'Stickers') {
        ({ data, error } = await supabase
          .from('marketplace_listings')
          .insert({ ...listingPayload, category: 'Mixed' })
          .select('id')
          .single());
      }
      if (error) throw error;
      return res.status(201).json({ id: data.id });
    }

    if (req.method === 'PATCH') {
      const listingId = cleanText(req.body?.id, 80);
      if (!listingId) throw httpError(400, 'Choose a listing to update.');
      const { data: existingListing, error: existingListingError } = await supabase
        .from('marketplace_listings')
        .select('id,category,piece_count')
        .eq('id', listingId)
        .eq('seller_id', user.id)
        .maybeSingle();
      if (existingListingError) throw existingListingError;
      if (!existingListing) throw httpError(404, 'Listing not found.');
      const updates = { updated_at: new Date().toISOString() };
      if (req.body?.status !== undefined) {
        const status = cleanText(req.body.status, 20);
        if (!['published', 'archived'].includes(status)) throw httpError(400, 'Choose a valid listing status.');
        updates.status = status;
      }
      if (req.body?.title !== undefined) {
        const title = cleanText(req.body.title, 120);
        if (title.length < 2) throw httpError(400, 'Add a title with at least two characters.');
        updates.title = title;
      }
      if (req.body?.description !== undefined) updates.description = cleanText(req.body.description, 2000);
      if (req.body?.category !== undefined) {
        const category = normalizeCategory(cleanText(req.body.category, 40));
        if (!CATEGORIES.has(category)) throw httpError(400, 'Choose a valid puzzle-set category.');
        const existingIsSticker = Number(existingListing.piece_count) === 0;
        if ((category === 'Stickers') !== existingIsSticker) {
          throw httpError(400, 'A listing cannot switch between a model and a surface sticker.');
        }
        if (!existingIsSticker) updates.category = category;
      }
      if (req.body?.priceCents !== undefined) {
        const priceCents = Math.round(Number(req.body.priceCents));
        if (!Number.isInteger(priceCents) || priceCents < 100 || priceCents > 10000000) throw httpError(400, 'Enter a price between 1.00 and 100,000.00.');
        updates.price_cents = priceCents;
      }
      if (Object.keys(updates).length === 1) throw httpError(400, 'No listing changes were provided.');

      let { data, error } = await supabase
        .from('marketplace_listings')
        .update(updates)
        .eq('id', listingId)
        .eq('seller_id', user.id)
        .select('id')
        .maybeSingle();
      if (error?.code === '23514' && updates.category === '8 Morocco') {
        ({ data, error } = await supabase
          .from('marketplace_listings')
          .update({ ...updates, category: LEGACY_MOROCCO_CATEGORY })
          .eq('id', listingId)
          .eq('seller_id', user.id)
          .select('id')
          .maybeSingle());
      }
      if (error) throw error;
      if (!data) throw httpError(404, 'Listing not found.');
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    return sendApiError(res, error, 'The marketplace catalog is unavailable.');
  }
}
