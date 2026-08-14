import React, { useEffect, useMemo, useState } from 'react';
import { Archive, ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronDown, ChevronUp, Clock3, Eye, ExternalLink, FilePlus2, GraduationCap, LayoutDashboard, Pencil, Plus, Save, Send, Trash2, User, UserPlus, UsersRound, X } from 'lucide-react';
import { loadAuthenticatedUser, supabase } from './supabase.js';
import GIRIH_APPS from '../packages/girih-design/apps.json';
import './training.css';

const APP_META = Object.fromEntries(GIRIH_APPS.map((app) => [app.id, app]));
const STATUS_LABELS = { assigned: 'Not started', in_progress: 'In progress', submitted: 'Awaiting review', completed: 'Completed', needs_revision: 'Needs revision' };

async function trainingRequest(options = {}) {
  const { data } = await supabase.auth.getSession();
  const response = await fetch('/api/training', {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}`, ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'The training request could not be completed.');
  return payload;
}

function AcademyHeader({ user, mode }) {
  return <header className="academy-header girih-product-header girih-theme-academy">
    <a className="academy-brand" href="/"><img src="/landing/brand/girih-logo-color.png" alt="" /><span>Girih Studio</span><small><girih-app-icon app="academy" small></girih-app-icon>Academy</small></a>
    <nav><a href="/profile"><User size={15} /> Profile</a><girih-app-switcher current-app="girih" compact></girih-app-switcher><span className="academy-user"><b>{user?.name}</b><small>{mode === 'teacher' ? 'Teacher' : 'Student'}</small></span></nav>
  </header>;
}

function AcademyAppIcon({ appId }) {
  return <span className={`academy-app-mark app-${appId}`}><girih-app-icon app={appId || 'academy'}></girih-app-icon></span>;
}

function ProgressBar({ value }) {
  return <div className="academy-progress" aria-label={`${value}% complete`}><span style={{ width: `${value}%` }} /></div>;
}

const EMPTY_MODULE = {
  id: '', title: '', description: '', appId: 'girih', level: 'Foundation', estimatedMinutes: 30, status: 'draft',
  lessons: [{ title: '', body: '', steps: [''], duration: 8 }],
  assessment: { title: '', brief: '', criteria: [''] },
};

function moduleForm(module) {
  if (!module) return structuredClone(EMPTY_MODULE);
  return {
    id: module.id, title: module.title, description: module.description || '', appId: module.app_id,
    level: module.level, estimatedMinutes: module.estimated_minutes, status: module.status || (module.is_published ? 'published' : 'draft'),
    lessons: (module.lessons || []).map((lesson) => ({ ...lesson, steps: [...(lesson.steps || [])] })),
    assessment: { title: module.assessment?.title || '', brief: module.assessment?.brief || '', criteria: [...(module.assessment?.criteria || [''])] },
  };
}

function CurriculumPreview({ module }) {
  const app = APP_META[module.appId];
  return <section className="academy-curriculum-preview">
    <header><span>{app?.shortName || 'App'} · {module.level}</span><h2>{module.title || 'Untitled module'}</h2><p>{module.description || 'Add a concise description of the learning outcome.'}</p></header>
    <div className="academy-preview-lessons">{module.lessons.map((lesson, index) => <article key={`${lesson.title}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{lesson.title || 'Untitled lesson'}</h3><p>{lesson.body || 'Lesson material will appear here.'}</p>{lesson.steps?.filter(Boolean).length > 0 && <ol>{lesson.steps.filter(Boolean).map((step, stepIndex) => <li key={`${step}-${stepIndex}`}>{step}</li>)}</ol>}<small><Clock3 size={13} /> {lesson.duration || 0} min</small></div></article>)}</div>
    <div className="academy-preview-assessment"><p>Practical assessment</p><h3>{module.assessment.title || 'Untitled assessment'}</h3><span>{module.assessment.brief || 'Add the practical model brief.'}</span><ul>{module.assessment.criteria.filter(Boolean).map((item) => <li key={item}><Check size={14} />{item}</li>)}</ul></div>
  </section>;
}

function CurriculumEditor({ initialModule, busy, onClose, onSave }) {
  const [form, setForm] = useState(() => moduleForm(initialModule));
  const [mode, setMode] = useState('edit');
  const appOptions = GIRIH_APPS.filter((app) => ['girih', 'bricks', 'muqarnas', 'mehraz'].includes(app.id));
  const updateLesson = (index, field, value) => setForm((current) => ({ ...current, lessons: current.lessons.map((lesson, lessonIndex) => lessonIndex === index ? { ...lesson, [field]: value } : lesson) }));
  const moveLesson = (index, direction) => setForm((current) => { const lessons = [...current.lessons]; const nextIndex = index + direction; if (nextIndex < 0 || nextIndex >= lessons.length) return current; [lessons[index], lessons[nextIndex]] = [lessons[nextIndex], lessons[index]]; return { ...current, lessons }; });
  const removeLesson = (index) => setForm((current) => ({ ...current, lessons: current.lessons.filter((_, lessonIndex) => lessonIndex !== index) }));
  const updateCriterion = (index, value) => setForm((current) => ({ ...current, assessment: { ...current.assessment, criteria: current.assessment.criteria.map((item, criterionIndex) => criterionIndex === index ? value : item) } }));
  return <div className="academy-dialog-backdrop academy-curriculum-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="academy-curriculum-dialog">
    <header className="academy-curriculum-dialog-header"><div><p>{form.id ? 'Edit curriculum' : 'New curriculum'}</p><h2>{form.id ? form.title : 'Create training module'}</h2></div><div className="academy-editor-header-actions"><div className="academy-editor-modes"><button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}><Pencil size={14} /> Edit</button><button className={mode === 'preview' ? 'active' : ''} onClick={() => setMode('preview')}><Eye size={14} /> Preview</button></div><button className="academy-editor-close" onClick={onClose} aria-label="Close curriculum editor"><X size={18} /></button></div></header>
    {mode === 'preview' ? <CurriculumPreview module={form} /> : <form className="academy-module-form" onSubmit={(event) => { event.preventDefault(); onSave(form, false); }}>
      <section className="academy-form-section"><div><span>01</span><h3>Module details</h3></div><div className="academy-form-fields"><label className="academy-field-wide">Module title<input value={form.title} maxLength="120" onChange={(event) => setForm({ ...form, title: event.target.value })} required /></label><label className="academy-field-wide">Description<textarea rows="3" maxLength="2000" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><label>App<select value={form.appId} onChange={(event) => setForm({ ...form, appId: event.target.value })}>{appOptions.map((app) => <option key={app.id} value={app.id}>{app.shortName}</option>)}</select></label><label>Level<select value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })}><option>Foundation</option><option>Intermediate</option><option>Advanced</option></select></label><label>Estimated time<input type="number" min="5" max="600" value={form.estimatedMinutes} onChange={(event) => setForm({ ...form, estimatedMinutes: event.target.value })} /></label></div></section>
      <section className="academy-form-section"><div><span>02</span><h3>Lessons</h3><small>Students complete these in order.</small></div><div className="academy-builder-list">{form.lessons.map((lesson, index) => <article className="academy-builder-row" key={index}><div className="academy-builder-order"><strong>{String(index + 1).padStart(2, '0')}</strong><button type="button" onClick={() => moveLesson(index, -1)} disabled={!index} title="Move lesson up"><ChevronUp size={15} /></button><button type="button" onClick={() => moveLesson(index, 1)} disabled={index === form.lessons.length - 1} title="Move lesson down"><ChevronDown size={15} /></button></div><div><label>Lesson title<input value={lesson.title} maxLength="120" onChange={(event) => updateLesson(index, 'title', event.target.value)} required /></label><label>Lesson overview<textarea rows="3" maxLength="3000" value={lesson.body} onChange={(event) => updateLesson(index, 'body', event.target.value)} required /></label><label>Instructions (one step per line)<textarea rows="6" maxLength="6000" value={(lesson.steps || []).join('\n')} onChange={(event) => updateLesson(index, 'steps', event.target.value.split('\n').slice(0, 12))} placeholder={'Select the first tool\nSet the required dimensions\nCheck the result'} /></label><label className="academy-duration-field">Duration (minutes)<input type="number" min="1" max="180" value={lesson.duration} onChange={(event) => updateLesson(index, 'duration', event.target.value)} /></label></div><button type="button" className="academy-remove-row" onClick={() => removeLesson(index)} disabled={form.lessons.length === 1} aria-label={`Remove lesson ${index + 1}`}><Trash2 size={16} /></button></article>)}<button type="button" className="academy-add-row" onClick={() => setForm({ ...form, lessons: [...form.lessons, { title: '', body: '', steps: [''], duration: 8 }] })}><Plus size={15} /> Add lesson</button></div></section>
      <section className="academy-form-section"><div><span>03</span><h3>Practical assessment</h3><small>Define the model students must complete.</small></div><div className="academy-form-fields"><label className="academy-field-wide">Assessment title<input value={form.assessment.title} maxLength="160" onChange={(event) => setForm({ ...form, assessment: { ...form.assessment, title: event.target.value } })} required /></label><label className="academy-field-wide">Model brief<textarea rows="5" maxLength="3000" value={form.assessment.brief} onChange={(event) => setForm({ ...form, assessment: { ...form.assessment, brief: event.target.value } })} required /></label><div className="academy-criteria academy-field-wide"><span>Completion criteria</span>{form.assessment.criteria.map((criterion, index) => <div key={index}><input value={criterion} maxLength="240" onChange={(event) => updateCriterion(index, event.target.value)} required /><button type="button" onClick={() => setForm({ ...form, assessment: { ...form.assessment, criteria: form.assessment.criteria.filter((_, criterionIndex) => criterionIndex !== index) } })} disabled={form.assessment.criteria.length === 1} aria-label={`Remove criterion ${index + 1}`}><X size={15} /></button></div>)}<button type="button" onClick={() => setForm({ ...form, assessment: { ...form.assessment, criteria: [...form.assessment.criteria, ''] } })}><Plus size={14} /> Add criterion</button></div></div></section>
      <footer className="academy-module-form-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" className="secondary" disabled={busy}><Save size={16} /> {form.id ? 'Save changes' : 'Save draft'}</button>{form.status !== 'published' && <button type="button" disabled={busy} onClick={() => onSave(form, true)}><CheckCircle2 size={16} /> Save and publish</button>}</footer>
    </form>}
  </div></div>;
}

function CurriculumManager({ payload, mutate, busy }) {
  const [editing, setEditing] = useState(undefined);
  const ownedModules = payload.modules.filter((module) => module.owner_id);
  const builtInModules = payload.modules.filter((module) => !module.owner_id);
  async function saveModule(module, publish) { await mutate({ action: 'save-module', module, publish }); setEditing(undefined); }
  async function setStatus(module, status) { if (status === 'archived' && !window.confirm(`Archive “${module.title}”? Existing student assignments will remain available.`)) return; await mutate({ action: 'set-module-status', moduleId: module.id, status }); }
  const moduleCard = (module, builtIn = false) => <article className="academy-curriculum-card" key={module.id}><div className={`academy-app-mark app-${module.app_id}`}>{(APP_META[module.app_id]?.shortName || 'A').slice(0, 1)}</div><div className="academy-curriculum-card-copy"><div><span>{APP_META[module.app_id]?.shortName} · {module.level}</span><i className={`academy-module-status module-${module.status || 'published'}`}>{builtIn ? 'Built-in' : module.status}</i></div><h3>{module.title}</h3><p>{module.description}</p><small>{module.lessons?.length || 0} lessons · {module.estimated_minutes} min</small></div><div className="academy-curriculum-card-actions">{builtIn ? <button onClick={() => setEditing({ ...module, owner_id: null })}><Eye size={15} /> Preview</button> : <><button onClick={() => setEditing(module)}><Pencil size={15} /> Edit</button>{module.status === 'draft' && <button className="primary" onClick={() => setStatus(module, 'published')}><Check size={15} /> Publish</button>}{module.status === 'published' && <button onClick={() => setStatus(module, 'draft')}>Unpublish</button>}{module.status !== 'archived' ? <button onClick={() => setStatus(module, 'archived')}><Archive size={15} /> Archive</button> : <button onClick={() => setStatus(module, 'draft')}>Restore draft</button>}</>}</div></article>;
  return <section className="academy-curriculum-area"><header><div><p>Teacher curriculum</p><h2>Training modules</h2><span>Create structured lessons and practical model assessments for your class.</span></div><button onClick={() => setEditing(null)}><FilePlus2 size={17} /> New module</button></header><div className="academy-curriculum-band"><div className="academy-curriculum-title"><h3>Your modules</h3><span>{ownedModules.length}</span></div>{!ownedModules.length && <div className="academy-empty academy-curriculum-empty">Create your first module as a draft, preview it, then publish it for assignments.</div>}<div className="academy-curriculum-grid">{ownedModules.map((module) => moduleCard(module))}</div></div><div className="academy-curriculum-band built-in"><div className="academy-curriculum-title"><h3>Built-in foundations</h3><span>{builtInModules.length}</span></div><div className="academy-curriculum-grid">{builtInModules.map((module) => moduleCard(module, true))}</div></div>{editing !== undefined && (editing?.owner_id === null ? <div className="academy-dialog-backdrop academy-curriculum-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setEditing(undefined)}><div className="academy-curriculum-dialog preview-only"><header className="academy-curriculum-dialog-header"><div><p>Built-in curriculum</p><h2>Module preview</h2></div><button className="academy-editor-close" onClick={() => setEditing(undefined)}><X size={18} /></button></header><CurriculumPreview module={moduleForm(editing)} /></div></div> : <CurriculumEditor initialModule={editing} busy={busy} onClose={() => setEditing(undefined)} onSave={saveModule} />)}</section>;
}

function TeacherDashboard({ payload, mutate, busy }) {
  const [activeView, setActiveView] = useState('class');
  const [invite, setInvite] = useState({ fullName: '', email: '' });
  const [assignment, setAssignment] = useState({ studentId: '', moduleId: '', dueAt: '' });
  const [reviewing, setReviewing] = useState(null);
  const modulesById = useMemo(() => Object.fromEntries(payload.modules.map((module) => [module.id, module])), [payload.modules]);
  const studentsById = useMemo(() => Object.fromEntries(payload.students.map((student) => [student.id, student])), [payload.students]);
  const completed = payload.assignments.filter((item) => item.status === 'completed').length;
  const submitted = payload.assignments.filter((item) => item.status === 'submitted').length;

  async function inviteStudent(event) {
    event.preventDefault();
    await mutate({ action: 'invite-student', ...invite });
    setInvite({ fullName: '', email: '' });
  }
  async function assignModule(event) {
    event.preventDefault();
    await mutate({ action: 'assign', ...assignment, dueAt: assignment.dueAt ? new Date(`${assignment.dueAt}T23:59:00`).toISOString() : null });
  }
  return <main className="academy-main">
    <section className="academy-heading"><div><p>Teacher workspace</p><h1>Guide every student from lesson to practice.</h1><span>Assign structured training across all Girih Studio apps and review the final model in one place.</span></div><GraduationCap size={58} /></section>
    <section className="academy-stats" aria-label="Class summary">
      <article><UsersRound /><span>Students</span><strong>{payload.students.length}</strong></article>
      <article><BookOpen /><span>Active assignments</span><strong>{payload.assignments.length - completed}</strong></article>
      <article><Send /><span>Ready to review</span><strong>{submitted}</strong></article>
      <article><CheckCircle2 /><span>Completed</span><strong>{completed}</strong></article>
    </section>
    <nav className="academy-teacher-tabs" aria-label="Teacher workspace views"><button className={activeView === 'class' ? 'active' : ''} onClick={() => setActiveView('class')}><UsersRound size={16} /> Class</button><button className={activeView === 'curriculum' ? 'active' : ''} onClick={() => setActiveView('curriculum')}><BookOpen size={16} /> Curriculum</button><button className={activeView === 'learning' ? 'active' : ''} onClick={() => setActiveView('learning')}><GraduationCap size={16} /> My training</button></nav>
    {activeView === 'curriculum' ? <CurriculumManager payload={payload} mutate={mutate} busy={busy} /> : activeView === 'learning' ? <TeacherLearning /> : <>
    <div className="academy-teacher-grid">
      <section className="academy-section academy-roster">
        <header><div><p>Class roster</p><h2>Students</h2></div><span>{payload.students.length}</span></header>
        <form className="academy-inline-form" onSubmit={inviteStudent}>
          <label><span>Student name</span><input value={invite.fullName} onChange={(e) => setInvite({ ...invite, fullName: e.target.value })} placeholder="Full name" required /></label>
          <label><span>Email address</span><input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="student@example.com" required /></label>
          <button disabled={busy}><UserPlus size={17} /> Invite student</button>
        </form>
        <div className="academy-student-list">
          {!payload.students.length && <div className="academy-empty">Invite your first student to build the class roster.</div>}
          {payload.students.map((student) => {
            const records = payload.assignments.filter((item) => item.student_id === student.id);
            const done = records.filter((item) => item.status === 'completed').length;
            return <article key={student.id}><span className="academy-avatar">{(student.full_name || student.email).slice(0, 1).toUpperCase()}</span><div><strong>{student.full_name || 'Student'}</strong><small>{student.email}</small></div><div className="academy-student-progress"><b>{done}/{records.length}</b><small>modules complete</small></div></article>;
          })}
        </div>
      </section>
      <section className="academy-section academy-assign">
        <header><div><p>Curriculum</p><h2>Assign training</h2></div><Plus size={20} /></header>
        <form onSubmit={assignModule}>
          <label>Student<select value={assignment.studentId} onChange={(e) => setAssignment({ ...assignment, studentId: e.target.value })} required><option value="">Choose student</option>{payload.students.map((student) => <option key={student.id} value={student.id}>{student.full_name || student.email}</option>)}</select></label>
          <label>Training module<select value={assignment.moduleId} onChange={(e) => setAssignment({ ...assignment, moduleId: e.target.value })} required><option value="">Choose module</option>{payload.modules.filter((module) => module.status === 'published' && module.is_published).map((module) => <option key={module.id} value={module.id}>{APP_META[module.app_id]?.shortName}: {module.title}</option>)}</select></label>
          <label>Due date <span>(optional)</span><input type="date" value={assignment.dueAt} onChange={(e) => setAssignment({ ...assignment, dueAt: e.target.value })} /></label>
          <button disabled={busy || !payload.students.length}><Send size={17} /> Assign module</button>
        </form>
      </section>
    </div>
    <section className="academy-section academy-assignments">
      <header><div><p>Learning activity</p><h2>Assignments</h2></div><span>{payload.assignments.length}</span></header>
      <div className="academy-table-wrap"><table><thead><tr><th>Student</th><th>Module</th><th>Progress</th><th>Status</th><th>Due</th><th></th></tr></thead><tbody>
        {payload.assignments.map((item) => {
          const module = modulesById[item.module_id]; const student = studentsById[item.student_id];
          const progress = module?.lessons?.length ? Math.round(((item.completed_lessons || []).length / module.lessons.length) * 100) : 0;
          return <tr key={item.id}><td><strong>{student?.full_name || student?.email || 'Student'}</strong></td><td><small>{APP_META[module?.app_id]?.shortName}</small><strong>{module?.title}</strong></td><td><ProgressBar value={progress} /><small>{progress}%</small></td><td><span className={`academy-status status-${item.status}`}>{STATUS_LABELS[item.status]}</span></td><td>{item.due_at ? new Date(item.due_at).toLocaleDateString() : 'Open'}</td><td>{item.status === 'submitted' && <button className="academy-review-button" onClick={() => setReviewing(item)}>Review</button>}</td></tr>;
        })}
      </tbody></table>{!payload.assignments.length && <div className="academy-empty">Assigned modules and progress will appear here.</div>}</div>
    </section>
    {reviewing && <ReviewDialog assignment={reviewing} module={modulesById[reviewing.module_id]} student={studentsById[reviewing.student_id]} busy={busy} onClose={() => setReviewing(null)} onSubmit={async (review) => { await mutate({ action: 'review', assignmentId: reviewing.id, ...review }); setReviewing(null); }} />}
    </>}
  </main>;
}

function TeacherLearning() {
  const trainingApps = GIRIH_APPS.filter((app) => ['girih', 'bricks', 'muqarnas', 'mehraz'].includes(app.id));
  function openTraining(appId) {
    if (window.GirihTrainingPanel?.open?.(appId)) return;
    window.location.href = `/training?app=${encodeURIComponent(appId)}`;
  }
  return <section className="academy-teacher-learning">
    <header><div><p>Personal development</p><h2>Learn with the same guided modules as your students.</h2><span>Complete each instruction in order, tick finished tasks, and continue until your own module reaches 100%.</span></div><GraduationCap size={40} /></header>
    <div className="academy-teacher-learning-grid">{trainingApps.map((app) => <article key={app.id}>
      <AcademyAppIcon appId={app.id} />
      <div><small>{app.category}</small><h3>{app.shortName}</h3><p>{app.description}</p></div>
      <button type="button" onClick={() => openTraining(app.id)}><BookOpen size={15} /> Open training panel</button>
    </article>)}</div>
  </section>;
}

function ReviewDialog({ assignment, module, student, onClose, onSubmit, busy }) {
  const [form, setForm] = useState({ score: 85, feedback: '', approved: true });
  return <div className="academy-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="academy-dialog" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
    <header><div><p>Practical assessment</p><h2>{student?.full_name || 'Student'}: {module?.assessment?.title}</h2></div><button type="button" onClick={onClose} aria-label="Close">×</button></header>
    <div className="academy-submission"><span>Model reference</span><strong>{assignment.practical_submission?.modelReference}</strong><p>{assignment.practical_submission?.notes || 'No submission notes.'}</p></div>
    <label>Score<input type="number" min="0" max="100" value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} /></label>
    <label>Feedback<textarea rows="4" value={form.feedback} onChange={(e) => setForm({ ...form, feedback: e.target.value })} placeholder="Give specific feedback on the model and next steps." /></label>
    <div className="academy-segmented"><button type="button" className={form.approved ? 'active' : ''} onClick={() => setForm({ ...form, approved: true })}>Approve</button><button type="button" className={!form.approved ? 'active' : ''} onClick={() => setForm({ ...form, approved: false })}>Request revision</button></div>
    <footer><button type="button" className="secondary" onClick={onClose}>Cancel</button><button disabled={busy}>Save review</button></footer>
  </form></div>;
}

function StudentDashboard({ payload, mutate, busy, requestedAppId = '' }) {
  const modulesById = useMemo(() => Object.fromEntries(payload.modules.map((module) => [module.id, module])), [payload.modules]);
  const scopedAssignments = useMemo(() => requestedAppId
    ? payload.assignments.filter((item) => modulesById[item.module_id]?.app_id === requestedAppId)
    : payload.assignments, [modulesById, payload.assignments, requestedAppId]);
  const [activeId, setActiveId] = useState(() => {
    const matching = requestedAppId
      ? payload.assignments.filter((item) => payload.modules.find((module) => module.id === item.module_id)?.app_id === requestedAppId)
      : payload.assignments;
    return matching.find((item) => item.status !== 'completed')?.id || matching[0]?.id || '';
  });
  const [submission, setSubmission] = useState({ modelReference: '', notes: '' });
  const assignment = scopedAssignments.find((item) => item.id === activeId);
  const module = assignment && modulesById[assignment.module_id];
  const completedLessons = assignment?.completed_lessons || [];
  const progress = module?.lessons?.length ? Math.round((completedLessons.length / module.lessons.length) * 100) : 0;
  async function toggleLesson(index) {
    const next = completedLessons.includes(index) ? completedLessons.filter((item) => item !== index) : [...completedLessons, index].sort();
    await mutate({ action: 'lesson-progress', assignmentId: assignment.id, completedLessons: next });
  }
  return <main className="academy-main academy-student-main">
    <section className="academy-heading"><div><p>My learning</p><h1>Learn the method. Then build it.</h1><span>Complete each lesson and finish the practical model to demonstrate your skills.</span></div><BookOpen size={58} /></section>
    {!scopedAssignments.length ? <section className="academy-no-assignments"><GraduationCap size={42} /><h2>No {requestedAppId ? APP_META[requestedAppId]?.shortName : ''} training assigned yet</h2><p>{requestedAppId ? 'Your teacher can assign a module for this app.' : 'Your teacher’s assignments will appear here.'}</p>{requestedAppId && <a href="/training">View all Academy modules</a>}</section> : <div className="academy-learning-layout">
      <aside className="academy-module-nav"><p>{requestedAppId ? `${APP_META[requestedAppId]?.shortName} modules` : 'Assigned modules'}</p>{scopedAssignments.map((item) => { const itemModule = modulesById[item.module_id]; return <button key={item.id} className={item.id === activeId ? 'active' : ''} onClick={() => setActiveId(item.id)}><span className={`academy-app-mark app-${itemModule?.app_id}`}>{(APP_META[itemModule?.app_id]?.shortName || 'A').slice(0, 1)}</span><span><strong>{itemModule?.title}</strong><small>{STATUS_LABELS[item.status]}</small></span><ArrowRight size={16} /></button>; })}{requestedAppId && <a className="academy-all-modules-link" href="/training">View all modules</a>}</aside>
      <section className="academy-course">
        <header className="academy-course-header"><div><span>{APP_META[module?.app_id]?.shortName} · {module?.level}</span><h2>{module?.title}</h2><p>{module?.description}</p></div><div className="academy-course-meter"><strong>{progress}%</strong><small>lesson progress</small><ProgressBar value={progress} /></div></header>
        <div className="academy-lesson-list">{module?.lessons?.map((lesson, index) => { const complete = completedLessons.includes(index); const locked = !complete && index > completedLessons.length; return <article className={`${complete ? 'complete' : ''} ${locked ? 'locked' : ''}`} key={lesson.title}><button type="button" onClick={() => toggleLesson(index)} disabled={busy || locked} aria-label={`${complete ? 'Mark incomplete' : 'Complete'} ${lesson.title}`}><Check size={17} /></button><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{lesson.title}</h3><p>{lesson.body}</p>{lesson.steps?.filter(Boolean).length > 0 && <ol>{lesson.steps.filter(Boolean).map((step, stepIndex) => <li key={`${step}-${stepIndex}`}>{step}</li>)}</ol>}<small><Clock3 size={13} /> {lesson.duration} min</small></div></article>; })}</div>
        <section className={`academy-practical ${progress === 100 ? 'ready' : ''}`}><div className="academy-practical-heading"><span><LayoutDashboard size={20} /></span><div><p>Final practical assessment</p><h2>{module?.assessment?.title}</h2></div></div><p>{module?.assessment?.brief}</p><ul>{module?.assessment?.criteria?.map((criterion) => <li key={criterion}><Check size={15} />{criterion}</li>)}</ul>
          {assignment.status === 'completed' ? <div className="academy-result success"><CheckCircle2 /><div><strong>Assessment completed · {assignment.score}%</strong><p>{assignment.feedback || 'Your teacher approved this practical model.'}</p></div></div> : assignment.status === 'submitted' ? <div className="academy-result"><Send /><div><strong>Submitted for review</strong><p>Your teacher will review the model and add feedback.</p></div></div> : <form onSubmit={async (e) => { e.preventDefault(); await mutate({ action: 'submit-assessment', assignmentId: assignment.id, ...submission }); }}>
            <a className={progress === 100 ? '' : 'disabled'} href={progress === 100 ? module?.assessment?.appUrl : undefined} target={module?.assessment?.appUrl?.startsWith('http') ? '_blank' : undefined}><ExternalLink size={16} /> Open {APP_META[module?.app_id]?.shortName}</a>
            <label>Saved model name or share link<input value={submission.modelReference} onChange={(e) => setSubmission({ ...submission, modelReference: e.target.value })} disabled={progress < 100} placeholder="Example: Courtyard rosette v2" required /></label>
            <label>Submission notes<textarea rows="3" value={submission.notes} onChange={(e) => setSubmission({ ...submission, notes: e.target.value })} disabled={progress < 100} placeholder="Describe your choices and anything your teacher should review." /></label>
            <button disabled={busy || progress < 100}><Send size={16} /> Submit practical model</button>
          </form>}
        </section>
      </section>
    </div>}
  </main>;
}

export default function TrainingPage() {
  const [user, setUser] = useState(null);
  const [payload, setPayload] = useState(null);
  const [status, setStatus] = useState('Loading Academy...');
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; if (!supabase) { setStatus('Authentication is not configured.'); return; } supabase.auth.getSession().then(async ({ data }) => { if (!data.session?.user) { window.location.href = '/app?mode=login'; return; } const [nextUser, nextPayload] = await Promise.all([loadAuthenticatedUser(data.session.user), trainingRequest()]); if (active) { setUser(nextUser); setPayload(nextPayload); setStatus(''); } }).catch((error) => active && setStatus(error.message)); return () => { active = false; }; }, []);
  async function mutate(body) { setBusy(true); setStatus(''); try { setPayload(await trainingRequest({ method: 'POST', body: JSON.stringify(body) })); } catch (error) { setStatus(error.message); throw error; } finally { setBusy(false); } }
  if (!payload) return <div className="academy-page"><AcademyHeader user={user} /><main className="academy-loading"><GraduationCap size={36} /><p>{status}</p></main></div>;
  const mode = payload.profile.mode;
  const requestedAppId = new URLSearchParams(window.location.search).get('app') || '';
  const scopedAppId = ['girih', 'bricks', 'muqarnas', 'mehraz'].includes(requestedAppId) ? requestedAppId : '';
  return <div className="academy-page"><AcademyHeader user={user} mode={mode} />{status && <div className="academy-alert" role="alert">{status}</div>}{payload.profile.account_type === 'individual' && payload.profile.role !== 'admin' ? <main className="academy-onboarding"><div><GraduationCap size={44} /><p>Girih Studio Academy</p><h1>Create your teacher profile</h1><span>Invite students, assign training for all four design apps, and assess their practical models.</span><button disabled={busy} onClick={() => mutate({ action: 'activate-teacher' })}>Continue as teacher <ArrowRight size={17} /></button><a href="/profile"><ArrowLeft size={15} /> Back to profile</a></div></main> : mode === 'teacher' ? <TeacherDashboard payload={payload} mutate={mutate} busy={busy} /> : <StudentDashboard payload={payload} mutate={mutate} busy={busy} requestedAppId={scopedAppId} />}</div>;
}
