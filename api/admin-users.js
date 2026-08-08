import { createServerServices, getProfile, httpError, requireAuthenticatedUser, sendApiError } from '../server/services.js';
import trainingHandler from '../server/training.js';

function countByUser(rows, key) {
  return rows.reduce((counts, row) => {
    const id = row[key];
    counts[id] = (counts[id] || 0) + 1;
    return counts;
  }, {});
}

async function fetchAllRows(supabase, table, columns, orderColumn = '') {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (orderColumn) query = query.order(orderColumn, { ascending: false });
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

const ADMIN_RANGES = new Set(['today', '7d', '30d', 'this_month', 'previous_month', 'all']);

function adminDateRange(value, now = new Date()) {
  const key = ADMIN_RANGES.has(value) ? value : '30d';
  const endAt = new Date(now);
  let startAt = null;
  let label = 'Since beginning';
  if (key === 'today') {
    startAt = new Date(Date.UTC(endAt.getUTCFullYear(), endAt.getUTCMonth(), endAt.getUTCDate()));
    label = 'Today';
  } else if (key === '7d') {
    startAt = new Date(Date.UTC(endAt.getUTCFullYear(), endAt.getUTCMonth(), endAt.getUTCDate() - 6));
    label = 'Last 7 days';
  } else if (key === '30d') {
    startAt = new Date(Date.UTC(endAt.getUTCFullYear(), endAt.getUTCMonth(), endAt.getUTCDate() - 29));
    label = 'Last 30 days';
  } else if (key === 'this_month') {
    startAt = new Date(Date.UTC(endAt.getUTCFullYear(), endAt.getUTCMonth(), 1));
    label = 'This month';
  } else if (key === 'previous_month') {
    startAt = new Date(Date.UTC(endAt.getUTCFullYear(), endAt.getUTCMonth() - 1, 1));
    endAt.setTime(Date.UTC(endAt.getUTCFullYear(), endAt.getUTCMonth(), 1));
    label = 'Previous month';
  }
  return { key, label, startAt: startAt?.toISOString() || null, endAt: endAt.toISOString() };
}

function rowInRange(row, column, range) {
  const timestamp = new Date(row?.[column]).getTime();
  if (!Number.isFinite(timestamp)) return false;
  const start = range.startAt ? new Date(range.startAt).getTime() : -Infinity;
  const end = new Date(range.endAt).getTime();
  return timestamp >= start && timestamp < end;
}

const TIMELINE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function timelineFloor(value, unit) {
  const date = new Date(value);
  if (unit === 'hour') return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours()));
  if (unit === 'month') return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function timelineNext(value, unit) {
  const date = new Date(value);
  if (unit === 'hour') date.setUTCHours(date.getUTCHours() + 1);
  else if (unit === 'month') date.setUTCMonth(date.getUTCMonth() + 1);
  else date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function timelineLabel(value, unit) {
  const date = new Date(value);
  if (unit === 'hour') return `${String(date.getUTCHours()).padStart(2, '0')}:00`;
  if (unit === 'month') return `${TIMELINE_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  return `${TIMELINE_MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function buildAdminTimeline(range, profiles, patterns, sessions) {
  const endAt = new Date(range.endAt);
  const datedRows = [
    ...profiles.map((row) => row.created_at),
    ...patterns.map((row) => row.created_at),
    ...sessions.map((row) => row.last_seen_at),
  ].map((value) => new Date(value).getTime()).filter(Number.isFinite);
  const earliest = datedRows.length ? Math.min(...datedRows) : endAt.getTime();
  const startAt = new Date(range.startAt || earliest);
  const historyDays = Math.max(0, (endAt.getTime() - startAt.getTime()) / (24 * 60 * 60 * 1000));
  const unit = range.key === 'today' ? 'hour' : range.key === 'all' && historyDays > 60 ? 'month' : 'day';
  const firstBucket = timelineFloor(startAt, unit);
  const lastBucket = timelineFloor(new Date(Math.max(startAt.getTime(), endAt.getTime() - 1)), unit);
  const buckets = [];
  const bucketMap = new Map();

  for (let cursor = firstBucket; cursor <= lastBucket; cursor = timelineNext(cursor, unit)) {
    const key = cursor.toISOString();
    const bucket = {
      key,
      label: timelineLabel(cursor, unit),
      newUsers: 0,
      savedDesigns: 0,
      totalSeconds: 0,
      activeUserIds: new Set(),
    };
    buckets.push(bucket);
    bucketMap.set(key, bucket);
  }

  const addToBucket = (row, column, callback) => {
    if (!rowInRange(row, column, range)) return;
    const bucket = bucketMap.get(timelineFloor(row[column], unit).toISOString());
    if (bucket) callback(bucket);
  };
  profiles.forEach((row) => addToBucket(row, 'created_at', (bucket) => { bucket.newUsers += 1; }));
  patterns.forEach((row) => addToBucket(row, 'created_at', (bucket) => { bucket.savedDesigns += 1; }));
  sessions.forEach((row) => addToBucket(row, 'last_seen_at', (bucket) => {
    bucket.totalSeconds += Number(row.duration_seconds || 0);
    bucket.activeUserIds.add(row.user_id);
  }));

  return {
    unit,
    points: buckets.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      newUsers: bucket.newUsers,
      savedDesigns: bucket.savedDesigns,
      totalSeconds: bucket.totalSeconds,
      activeUsers: bucket.activeUserIds.size,
    })),
  };
}

export default async function handler(req, res) {
  if (req.query?.service === 'training') return trainingHandler(req, res);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  try {
    const { supabase } = createServerServices();
    const user = await requireAuthenticatedUser(req, supabase);
    const requester = await getProfile(supabase, user.id);
    if (requester.role !== 'admin') throw httpError(403, 'Admin access is required.');

    const range = adminDateRange(String(req.query?.range || '30d'));
    const [profiles, patterns, listings, sessions] = await Promise.all([
      fetchAllRows(supabase, 'profiles', 'id,email,full_name,public_name,role,subscription_status,created_at,updated_at', 'created_at'),
      fetchAllRows(supabase, 'user_patterns', 'owner_id,created_at'),
      fetchAllRows(supabase, 'marketplace_listings', 'seller_id,status,created_at'),
      fetchAllRows(supabase, 'user_activity_sessions', 'user_id,last_seen_at,duration_seconds'),
    ]);
    const periodPatterns = patterns.filter((item) => rowInRange(item, 'created_at', range));
    const periodListings = listings.filter((item) => rowInRange(item, 'created_at', range));
    const periodSessions = sessions.filter((item) => rowInRange(item, 'last_seen_at', range));
    const periodProfiles = profiles.filter((item) => rowInRange(item, 'created_at', range));
    const savedCounts = countByUser(periodPatterns, 'owner_id');
    const listingCounts = countByUser(periodListings, 'seller_id');
    const publishedCounts = countByUser(periodListings.filter((item) => item.status === 'published'), 'seller_id');
    const now = Date.now();
    const latestActivityByUser = sessions.reduce((result, session) => {
      if (!result[session.user_id] || new Date(session.last_seen_at) > new Date(result[session.user_id])) result[session.user_id] = session.last_seen_at;
      return result;
    }, {});
    const activityByUser = periodSessions.reduce((result, session) => {
      const record = result[session.user_id] || { totalSeconds: 0, lastActiveAt: null, sessions: 0 };
      record.totalSeconds += Number(session.duration_seconds || 0);
      record.sessions += 1;
      if (!record.lastActiveAt || new Date(session.last_seen_at) > new Date(record.lastActiveAt)) record.lastActiveAt = session.last_seen_at;
      result[session.user_id] = record;
      return result;
    }, {});

    const users = profiles.map((profile) => {
      const activity = activityByUser[profile.id] || { totalSeconds: 0, lastActiveAt: null, sessions: 0 };
      const latestActivity = latestActivityByUser[profile.id] || null;
      const ageMs = latestActivity ? now - new Date(latestActivity).getTime() : Infinity;
      return {
        id: profile.id,
        name: profile.public_name || profile.full_name || profile.email?.split('@')[0] || 'Girih user',
        email: profile.email,
        role: profile.role,
        subscriptionStatus: profile.subscription_status,
        joinedAt: profile.created_at,
        lastActiveAt: latestActivity,
        periodLastActiveAt: activity.lastActiveAt,
        totalSeconds: activity.totalSeconds,
        sessionCount: activity.sessions,
        isOnline: ageMs <= 5 * 60 * 1000,
        isActive: activity.sessions > 0,
        registeredInRange: rowInRange(profile, 'created_at', range),
        savedDesigns: savedCounts[profile.id] || 0,
        marketplaceListings: listingCounts[profile.id] || 0,
        publishedListings: publishedCounts[profile.id] || 0,
      };
    });

    const trackedUsers = users.filter((item) => item.sessionCount > 0);
    const totalSeconds = users.reduce((sum, item) => sum + item.totalSeconds, 0);
    const timeline = buildAdminTimeline(range, profiles, patterns, sessions);
    res.status(200).json({
      generatedAt: new Date().toISOString(),
      range,
      timeline,
      summary: {
        totalUsers: users.length,
        paidUsers: users.filter((item) => item.role === 'paid').length,
        freeUsers: users.filter((item) => item.role === 'free').length,
        adminUsers: users.filter((item) => item.role === 'admin').length,
        activeUsers: users.filter((item) => item.isActive).length,
        onlineUsers: users.filter((item) => item.isOnline).length,
        totalSeconds,
        averageSeconds: trackedUsers.length ? Math.round(totalSeconds / trackedUsers.length) : 0,
        savedDesigns: periodPatterns.length,
        marketplaceListings: periodListings.length,
        publishedListings: periodListings.filter((item) => item.status === 'published').length,
        newUsers: periodProfiles.length,
      },
      users,
    });
  } catch (error) {
    return sendApiError(res, error, 'The admin user overview is unavailable.');
  }
}
