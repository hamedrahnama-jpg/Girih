import { createServerServices, httpError, sendApiError } from '../server/services.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const { supabase } = createServerServices();
    const id = String(req.query?.id || '').trim();
    if (!id) throw httpError(400, 'Profile id is required.');
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id,public_name,full_name,bio,created_at')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!profile) throw httpError(404, 'Artist profile not found.');
    return res.status(200).json({
      profile: {
        id: profile.id,
        publicName: profile.public_name || profile.full_name || 'Girih artist',
        bio: profile.bio || '',
        joinedAt: profile.created_at,
      },
    });
  } catch (error) {
    return sendApiError(res, error, 'The artist profile is unavailable.');
  }
}
