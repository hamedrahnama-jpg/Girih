import { createServerServices, requireAuthenticatedUser, sendApiError } from '../server/services.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  try {
    const { supabase } = createServerServices();
    const user = await requireAuthenticatedUser(req, supabase);
    const sessionKey = String(req.body?.sessionKey || '').trim().slice(0, 120);
    if (sessionKey.length < 8) return res.status(400).json({ error: 'A valid activity session is required.' });

    const now = new Date();
    const { data: existing, error: readError } = await supabase
      .from('user_activity_sessions')
      .select('id,last_seen_at,duration_seconds')
      .eq('user_id', user.id)
      .eq('session_key', sessionKey)
      .maybeSingle();
    if (readError) throw readError;

    if (!existing) {
      const { error } = await supabase.from('user_activity_sessions').insert({
        user_id: user.id,
        session_key: sessionKey,
        started_at: now.toISOString(),
        last_seen_at: now.toISOString(),
      });
      if (error) throw error;
    } else {
      const previousSeen = new Date(existing.last_seen_at).getTime();
      const elapsedSeconds = Math.max(0, Math.min(90, Math.round((now.getTime() - previousSeen) / 1000)));
      const { error } = await supabase
        .from('user_activity_sessions')
        .update({
          last_seen_at: now.toISOString(),
          duration_seconds: Number(existing.duration_seconds || 0) + elapsedSeconds,
        })
        .eq('id', existing.id);
      if (error) throw error;
    }

    res.status(200).json({ recorded: true });
  } catch (error) {
    return sendApiError(res, error, 'Activity could not be recorded.');
  }
}
