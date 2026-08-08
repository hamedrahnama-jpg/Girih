import {
  createServerServices,
  httpError,
  requireAuthenticatedUser,
  sendApiError,
} from '../server/services.js';

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function clientPattern(item) {
  return {
    id: item.id,
    name: item.title,
    pieceCount: item.piece_count,
    previewImage: item.preview_image,
    modelData: item.model_data,
    updatedAt: item.updated_at,
  };
}

export default async function handler(req, res) {
  try {
    const { supabase } = createServerServices();
    const user = await requireAuthenticatedUser(req, supabase);

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('user_patterns')
        .select('id,title,piece_count,preview_image,model_data,updated_at')
        .eq('owner_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return res.status(200).json({ patterns: (data || []).map(clientPattern) });
    }

    if (req.method === 'POST') {
      const modelData = req.body?.modelData;
      const previewImage = String(req.body?.previewImage || '');
      const title = cleanText(req.body?.title || modelData?.name, 120);
      const pieceCount = Array.isArray(modelData?.pieces) ? modelData.pieces.length : 0;
      if (!title) throw httpError(400, 'Give the saved pattern a name.');
      if (!pieceCount) throw httpError(400, 'The pattern must contain at least one piece.');
      if (!previewImage.startsWith('data:image/') || previewImage.length > 2_500_000) throw httpError(400, 'The pattern preview is invalid or too large.');
      if (JSON.stringify(modelData).length > 5_000_000) throw httpError(413, 'The pattern is too large for profile storage.');
      const { data, error } = await supabase
        .from('user_patterns')
        .insert({ owner_id: user.id, title, piece_count: pieceCount, preview_image: previewImage, model_data: modelData })
        .select('id,title,piece_count,preview_image,model_data,updated_at')
        .single();
      if (error) throw error;
      return res.status(201).json({ pattern: clientPattern(data) });
    }

    if (req.method === 'DELETE') {
      const id = cleanText(req.query?.id, 80);
      if (!id) throw httpError(400, 'Choose a saved pattern to remove.');
      const { data, error } = await supabase
        .from('user_patterns')
        .delete()
        .eq('id', id)
        .eq('owner_id', user.id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw httpError(404, 'Saved pattern not found.');
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    return sendApiError(res, error, 'Your saved patterns are unavailable.');
  }
}
