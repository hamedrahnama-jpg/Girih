import { createSupabaseAdmin, getProfile, httpError, requireAuthenticatedUser, sendApiError } from './services.js';

const APP_URLS = {
  girih: '/app',
  bricks: 'https://bricks.girihstudio.com',
  muqarnas: 'https://muqarnas.girihstudio.com',
  mehraz: 'https://mehraz.girihstudio.com',
};
const APP_IDS = new Set(Object.keys(APP_URLS));
const LEVELS = new Set(['Foundation', 'Intermediate', 'Advanced']);
const EMBEDDED_ORIGIN = /^https:\/\/(?:[a-z0-9-]+\.)?girihstudio\.com$/i;

function cleanText(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function allowEmbeddedTrainingRequest(req, res) {
  const origin = String(req.headers?.origin || '');
  const localOrigin = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin);
  if (EMBEDDED_ORIGIN.test(origin) || localOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
}

export function moduleTaskIds(module) {
  return (module?.lessons || []).flatMap((lesson, lessonIndex) => {
    const steps = (lesson?.steps || []).filter(Boolean);
    return steps.length
      ? steps.map((_, stepIndex) => `${lessonIndex}:${stepIndex}`)
      : [`${lessonIndex}:lesson`];
  });
}

async function embeddedTrainingPayload(supabase, user, appId) {
  if (!APP_IDS.has(appId)) throw httpError(400, 'Choose a supported Girih Studio app.');
  const { data: modules, error: moduleError } = await supabase
    .from('training_modules')
    .select('id,slug,app_id,title,description,level,estimated_minutes,lessons')
    .eq('app_id', appId)
    .is('owner_id', null)
    .eq('status', 'published')
    .eq('is_published', true)
    .order('created_at', { ascending: true });
  if (moduleError) throw moduleError;
  const moduleIds = (modules || []).map((module) => module.id);
  const { data: progress, error: progressError } = moduleIds.length
    ? await supabase
      .from('training_self_progress')
      .select('module_id,completed_tasks,started_at,completed_at,updated_at')
      .eq('user_id', user.id)
      .in('module_id', moduleIds)
    : { data: [], error: null };
  if (progressError) throw progressError;
  return { appId, modules: modules || [], progress: progress || [] };
}

function moduleInput(body = {}) {
  const title = cleanText(body.title, 120);
  const description = cleanText(body.description, 2000);
  const appId = cleanText(body.appId, 20);
  const level = cleanText(body.level, 20);
  const estimatedMinutes = Math.max(5, Math.min(600, Number(body.estimatedMinutes) || 30));
  const lessons = (Array.isArray(body.lessons) ? body.lessons : []).slice(0, 30).map((lesson) => ({
    title: cleanText(lesson?.title, 120),
    body: cleanText(lesson?.body, 3000),
    steps: (Array.isArray(lesson?.steps) ? lesson.steps : []).slice(0, 12).map((step) => cleanText(step, 500)).filter(Boolean),
    duration: Math.max(1, Math.min(180, Number(lesson?.duration) || 5)),
  })).filter((lesson) => lesson.title && lesson.body);
  const assessment = {
    title: cleanText(body.assessment?.title, 160),
    brief: cleanText(body.assessment?.brief, 3000),
    criteria: (Array.isArray(body.assessment?.criteria) ? body.assessment.criteria : []).slice(0, 12).map((item) => cleanText(item, 240)).filter(Boolean),
    appUrl: APP_URLS[appId] || '',
  };
  if (title.length < 3) throw httpError(400, 'Module title must contain at least three characters.');
  if (!APP_IDS.has(appId)) throw httpError(400, 'Choose a supported Girih Studio app.');
  if (!LEVELS.has(level)) throw httpError(400, 'Choose a valid module level.');
  if (!lessons.length) throw httpError(400, 'Add at least one complete lesson.');
  if (!assessment.title || !assessment.brief || !assessment.criteria.length) throw httpError(400, 'Complete the practical assessment and add at least one criterion.');
  return { title, description, app_id: appId, level, estimated_minutes: estimatedMinutes, lessons, assessment };
}

function moduleSlug(title, userId) {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'module';
  return `${base}-${userId.slice(0, 8)}-${Date.now().toString(36)}`;
}

async function requireTeacher(supabase, userId) {
  const profile = await getProfile(supabase, userId);
  if (profile.account_type !== 'teacher' && profile.role !== 'admin') throw httpError(403, 'Teacher access is required.');
  return profile;
}

async function ownedModule(supabase, moduleId, userId) {
  const { data, error } = await supabase.from('training_modules').select('*').eq('id', moduleId).maybeSingle();
  if (error) throw error;
  if (!data || data.owner_id !== userId) throw httpError(403, 'You can only change modules that you created.');
  return data;
}

async function academyPayload(supabase, user, profile) {
  const isTeacher = profile.account_type === 'teacher' || profile.role === 'admin';
  if (isTeacher) {
    const [{ data: modules, error: moduleError }, { data: links, error: linkError }, { data: assignments, error: assignmentError }] = await Promise.all([
      supabase.from('training_modules').select('*').or(`owner_id.is.null,owner_id.eq.${user.id}`).order('updated_at', { ascending: false }),
      supabase.from('teacher_students').select('student_id,created_at').eq('teacher_id', user.id),
      supabase.from('training_assignments').select('*').eq('teacher_id', user.id).order('assigned_at', { ascending: false }),
    ]);
    if (moduleError) throw moduleError;
    if (linkError) throw linkError;
    if (assignmentError) throw assignmentError;
    const ids = (links || []).map((item) => item.student_id);
    const { data: students, error: studentError } = ids.length
      ? await supabase.from('profiles').select('id,email,full_name,created_at').in('id', ids)
      : { data: [], error: null };
    if (studentError) throw studentError;
    return { profile: { ...profile, mode: 'teacher' }, modules: modules || [], students: students || [], assignments: assignments || [] };
  }
  const { data: assignments, error: assignmentError } = await supabase.from('training_assignments').select('*').eq('student_id', user.id).order('assigned_at', { ascending: false });
  if (assignmentError) throw assignmentError;
  const moduleIds = [...new Set((assignments || []).map((item) => item.module_id))];
  const { data: modules, error: moduleError } = moduleIds.length
    ? await supabase.from('training_modules').select('*').in('id', moduleIds)
    : { data: [], error: null };
  if (moduleError) throw moduleError;
  return { profile: { ...profile, mode: 'student' }, modules: modules || [], students: [], assignments: assignments || [] };
}

export default async function handler(req, res) {
  allowEmbeddedTrainingRequest(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const supabase = createSupabaseAdmin();
    const user = await requireAuthenticatedUser(req, supabase);
    const profile = await getProfile(supabase, user.id);
    const embeddedAppId = cleanText(req.query?.app, 20);
    if (req.method === 'GET' && embeddedAppId) return res.status(200).json(await embeddedTrainingPayload(supabase, user, embeddedAppId));
    if (req.method === 'GET') return res.status(200).json(await academyPayload(supabase, user, profile));
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    const action = cleanText(req.body?.action, 40);
    if (action === 'task-progress') {
      const moduleId = cleanText(req.body?.moduleId, 60);
      const { data: module, error: moduleError } = await supabase
        .from('training_modules')
        .select('id,owner_id,status,is_published,lessons')
        .eq('id', moduleId)
        .maybeSingle();
      if (moduleError) throw moduleError;
      if (!module || module.owner_id || module.status !== 'published' || !module.is_published) {
        throw httpError(404, 'This built-in training module is not available.');
      }
      const validTaskIds = moduleTaskIds(module);
      const requestedTasks = Array.isArray(req.body?.completedTasks) ? req.body.completedTasks : [];
      const completedTasks = [...new Set(requestedTasks.map((item) => cleanText(item, 40)))]
        .filter((item) => validTaskIds.includes(item));
      const now = new Date().toISOString();
      const complete = validTaskIds.length > 0 && completedTasks.length === validTaskIds.length;
      const { error } = await supabase.from('training_self_progress').upsert({
        user_id: user.id,
        module_id: module.id,
        completed_tasks: completedTasks,
        started_at: completedTasks.length ? now : null,
        completed_at: complete ? now : null,
        updated_at: now,
      }, { onConflict: 'user_id,module_id' });
      if (error) throw error;
      return res.status(200).json({ moduleId: module.id, completedTasks, percent: validTaskIds.length ? Math.round(completedTasks.length / validTaskIds.length * 100) : 0 });
    } else if (action === 'activate-teacher') {
      if (profile.account_type === 'student') throw httpError(403, 'Student profiles cannot be converted from this page.');
      const { error } = await supabase.from('profiles').update({ account_type: 'teacher', updated_at: new Date().toISOString() }).eq('id', user.id);
      if (error) throw error;
    } else if (action === 'save-module') {
      await requireTeacher(supabase, user.id);
      const values = moduleInput(req.body?.module);
      const moduleId = cleanText(req.body?.module?.id, 60);
      const publish = Boolean(req.body?.publish);
      if (moduleId) {
        const current = await ownedModule(supabase, moduleId, user.id);
        const { error } = await supabase.from('training_modules').update({ ...values, ...(publish ? { status: 'published', is_published: true, archived_at: null } : {}), updated_at: new Date().toISOString() }).eq('id', current.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('training_modules').insert({ ...values, slug: moduleSlug(values.title, user.id), owner_id: user.id, status: publish ? 'published' : 'draft', is_published: publish });
        if (error) throw error;
      }
    } else if (action === 'set-module-status') {
      await requireTeacher(supabase, user.id);
      const moduleId = cleanText(req.body?.moduleId, 60);
      const status = cleanText(req.body?.status, 20);
      if (!['draft', 'published', 'archived'].includes(status)) throw httpError(400, 'Choose a valid module status.');
      const current = await ownedModule(supabase, moduleId, user.id);
      if (status === 'published') moduleInput({ ...current, appId: current.app_id, estimatedMinutes: current.estimated_minutes });
      const now = new Date().toISOString();
      const { error } = await supabase.from('training_modules').update({ status, is_published: status === 'published', archived_at: status === 'archived' ? now : null, updated_at: now }).eq('id', current.id);
      if (error) throw error;
    } else if (action === 'invite-student') {
      await requireTeacher(supabase, user.id);
      const email = cleanText(req.body?.email, 320).toLowerCase();
      const fullName = cleanText(req.body?.fullName, 120);
      if (!email || !email.includes('@') || !fullName) throw httpError(400, 'Student name and a valid email are required.');
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName, account_type: 'student' } });
      if (error) throw httpError(error.status || 400, error.message);
      await supabase.from('profiles').upsert({ id: data.user.id, email, full_name: fullName, account_type: 'student', updated_at: new Date().toISOString() });
      const { error: linkError } = await supabase.from('teacher_students').upsert({ teacher_id: user.id, student_id: data.user.id });
      if (linkError) throw linkError;
    } else if (action === 'assign') {
      await requireTeacher(supabase, user.id);
      const studentId = cleanText(req.body?.studentId, 60);
      const moduleId = cleanText(req.body?.moduleId, 60);
      const [{ data: link }, { data: module }] = await Promise.all([
        supabase.from('teacher_students').select('student_id').eq('teacher_id', user.id).eq('student_id', studentId).maybeSingle(),
        supabase.from('training_modules').select('id,owner_id,status,is_published').eq('id', moduleId).maybeSingle(),
      ]);
      if (!link) throw httpError(403, 'This student is not in your class.');
      if (!module || module.status !== 'published' || !module.is_published || (module.owner_id && module.owner_id !== user.id)) throw httpError(400, 'Only published modules available to your class can be assigned.');
      const { error } = await supabase.from('training_assignments').upsert({ teacher_id: user.id, student_id: studentId, module_id: moduleId, due_at: req.body?.dueAt || null, status: 'assigned', completed_lessons: [], practical_submission: null, score: null, feedback: null, started_at: null, submitted_at: null, completed_at: null, updated_at: new Date().toISOString() }, { onConflict: 'module_id,teacher_id,student_id' });
      if (error) throw error;
    } else if (action === 'lesson-progress') {
      const assignmentId = cleanText(req.body?.assignmentId, 60);
      const completedLessons = [...new Set((req.body?.completedLessons || []).map((item) => Number(item)).filter(Number.isInteger))];
      const { data: assignment } = await supabase.from('training_assignments').select('student_id').eq('id', assignmentId).maybeSingle();
      if (!assignment || assignment.student_id !== user.id) throw httpError(403, 'This assignment does not belong to you.');
      const { error } = await supabase.from('training_assignments').update({ completed_lessons: completedLessons, status: 'in_progress', started_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', assignmentId);
      if (error) throw error;
    } else if (action === 'submit-assessment') {
      const assignmentId = cleanText(req.body?.assignmentId, 60);
      const { data: assignment } = await supabase.from('training_assignments').select('student_id').eq('id', assignmentId).maybeSingle();
      if (!assignment || assignment.student_id !== user.id) throw httpError(403, 'This assignment does not belong to you.');
      const modelReference = cleanText(req.body?.modelReference, 500);
      const notes = cleanText(req.body?.notes, 1500);
      if (!modelReference) throw httpError(400, 'Add the saved model name or share link before submitting.');
      const now = new Date().toISOString();
      const { error } = await supabase.from('training_assignments').update({ practical_submission: { modelReference, notes }, status: 'submitted', submitted_at: now, updated_at: now }).eq('id', assignmentId);
      if (error) throw error;
    } else if (action === 'review') {
      await requireTeacher(supabase, user.id);
      const assignmentId = cleanText(req.body?.assignmentId, 60);
      const approved = Boolean(req.body?.approved);
      const score = Math.max(0, Math.min(100, Number(req.body?.score) || 0));
      const now = new Date().toISOString();
      const { error } = await supabase.from('training_assignments').update({ status: approved ? 'completed' : 'needs_revision', score, feedback: cleanText(req.body?.feedback, 1500), completed_at: approved ? now : null, updated_at: now }).eq('id', assignmentId).eq('teacher_id', user.id);
      if (error) throw error;
    } else {
      throw httpError(400, 'Unknown training action.');
    }
    return res.status(200).json(await academyPayload(supabase, user, await getProfile(supabase, user.id)));
  } catch (error) {
    return sendApiError(res, error, 'The training service could not complete this request.');
  }
}
