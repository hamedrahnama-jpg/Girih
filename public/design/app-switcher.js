const FALLBACK_APPS = [
  { id: 'girih', name: 'Girih App', url: 'https://girihstudio.com/app', description: 'Geometric pattern design', status: 'available' },
  { id: 'bricks', name: 'Bricks App', url: 'https://bricks.girihstudio.com', description: 'Brick pattern design', status: 'available' },
  { id: 'muqarnas', name: 'Muqarnas App', url: 'https://muqarnas.girihstudio.com', description: 'Muqarnas design', status: 'available' },
  { id: 'mehraz', name: 'Mehraz App', url: 'https://mehraz.girihstudio.com', description: 'Architectural composition', status: 'available' },
  { id: 'academy', name: 'Training', url: 'https://girihstudio.com/training', description: 'Guided tasks for this app', status: 'available' },
];

const APP_ICONS = {
  girih: '<img src="https://girihstudio.com/design/icons/girih.png" alt="" aria-hidden="true" />',
  bricks: '<img src="https://girihstudio.com/design/icons/bricks.png" alt="" aria-hidden="true" />',
  muqarnas: '<img src="https://girihstudio.com/design/icons/muqarnas.png" alt="" aria-hidden="true" />',
  mehraz: '<img src="https://girihstudio.com/design/icons/mehraz.png" alt="" aria-hidden="true" />',
  academy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="m3 8 9-4 9 4-9 4-9-4Z"/><path d="M7 10.5V15c2.7 2 7.3 2 10 0v-4.5M21 8v7"/></svg>',
};

const TRAINING_APPS = new Set(['girih', 'bricks', 'muqarnas', 'mehraz']);
const TRAINING_API = 'https://girihstudio.com/api/training';

function currentStudioApp() {
  const host = window.location.hostname.toLowerCase();
  if (host.startsWith('bricks.')) return 'bricks';
  if (host.startsWith('muqarnas.')) return 'muqarnas';
  if (host.startsWith('mehraz.')) return 'mehraz';
  if (window.location.pathname === '/app' || window.location.pathname.startsWith('/app/')) return 'girih';
  return '';
}

function storedAccessToken() {
  try {
    const value = JSON.parse(localStorage.getItem('girihstudio-supabase-auth') || 'null');
    return value?.access_token || value?.currentSession?.access_token || value?.session?.access_token || '';
  } catch {
    return '';
  }
}

function trainingTaskIds(module) {
  return (module?.lessons || []).flatMap((lesson, lessonIndex) => {
    const steps = (lesson?.steps || []).filter(Boolean);
    return steps.length ? steps.map((_, stepIndex) => `${lessonIndex}:${stepIndex}`) : [`${lessonIndex}:lesson`];
  });
}

class GirihTrainingPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.appId = '';
    this.modules = [];
    this.progress = new Map();
    this.activeModuleId = '';
    this.activeTaskIndex = 0;
    this.loading = false;
    this.saving = false;
    this.message = '';
  }

  connectedCallback() {
    this.render();
  }

  openFor(appId) {
    if (!TRAINING_APPS.has(appId)) return;
    const changed = this.appId !== appId;
    this.appId = appId;
    this.setAttribute('open', '');
    document.documentElement.classList.add('girih-training-open');
    this.render();
    if (changed || !this.modules.length) this.load();
  }

  close() {
    this.removeAttribute('open');
    document.documentElement.classList.remove('girih-training-open');
  }

  async request(options = {}) {
    const token = storedAccessToken();
    if (!token) throw new Error('Sign in to save and continue your training progress.');
    const response = await fetch(`${TRAINING_API}${options.query || ''}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Training could not be loaded.');
    return payload;
  }

  async load() {
    this.loading = true;
    this.message = '';
    this.render();
    try {
      const payload = await this.request({ query: `?app=${encodeURIComponent(this.appId)}` });
      this.modules = payload.modules || [];
      this.progress = new Map((payload.progress || []).map((item) => [item.module_id, item.completed_tasks || []]));
      if (!this.modules.some((module) => module.id === this.activeModuleId)) {
        this.activeModuleId = this.modules[0]?.id || '';
        this.activeTaskIndex = 0;
      }
    } catch (error) {
      this.modules = [];
      this.message = error.message;
    } finally {
      this.loading = false;
      this.render();
    }
  }

  async toggleTask(module, taskId) {
    if (this.saving) return;
    const previous = [...(this.progress.get(module.id) || [])];
    const completed = previous.includes(taskId)
      ? previous.filter((item) => item !== taskId)
      : [...previous, taskId];
    this.progress.set(module.id, completed);
    this.saving = true;
    this.message = '';
    this.render();
    try {
      const result = await this.request({
        method: 'POST',
        body: JSON.stringify({ action: 'task-progress', moduleId: module.id, completedTasks: completed }),
      });
      this.progress.set(module.id, result.completedTasks || []);
      const taskIndex = trainingTaskIds(module).indexOf(taskId);
      if (!previous.includes(taskId) && taskIndex >= 0) {
        this.activeTaskIndex = Math.min(taskIndex + 1, trainingTaskIds(module).length - 1);
      }
      if (result.percent === 100) this.message = 'Module complete — 100% achieved.';
    } catch (error) {
      this.progress.set(module.id, previous);
      this.message = error.message;
    } finally {
      this.saving = false;
      this.render();
    }
  }

  renderContent() {
    if (this.loading) return '<div class="minimal-state"><span class="spinner"></span><strong>Loading training…</strong></div>';
    if (!this.modules.length) {
      const signIn = this.message.toLowerCase().includes('sign in');
      return `<div class="minimal-state"><strong>${signIn ? 'Sign in to start training' : 'No training available'}</strong><span>${this.escape(this.message || 'No published module for this app.')}</span>${signIn ? '<a href="https://girihstudio.com/app?mode=login">Sign in</a>' : '<button class="retry" type="button">Retry</button>'}</div>`;
    }
    const module = this.modules.find((item) => item.id === this.activeModuleId) || this.modules[0];
    const taskItems = (module.lessons || []).flatMap((lesson, lessonIndex) => {
      const steps = (lesson.steps || []).filter(Boolean);
      const tasks = steps.length ? steps : ['Mark this lesson as complete'];
      return tasks.map((text, stepIndex) => ({
        id: steps.length ? `${lessonIndex}:${stepIndex}` : `${lessonIndex}:lesson`,
        lessonIndex,
        lessonTitle: lesson.title || `Lesson ${lessonIndex + 1}`,
        lessonBody: lesson.body || '',
        duration: Number(lesson.duration) || 0,
        text,
      }));
    });
    const allTasks = taskItems.map((item) => item.id);
    const completed = this.progress.get(module.id) || [];
    const percent = allTasks.length ? Math.round(completed.length / allTasks.length * 100) : 0;
    this.activeTaskIndex = Math.max(0, Math.min(this.activeTaskIndex, Math.max(taskItems.length - 1, 0)));
    const currentTask = taskItems[this.activeTaskIndex];
    const firstIncomplete = allTasks.findIndex((id) => !completed.includes(id));
    const done = currentTask ? completed.includes(currentTask.id) : false;
    const locked = currentTask ? !done && firstIncomplete >= 0 && this.activeTaskIndex > firstIncomplete : false;
    if (!currentTask) return '<div class="minimal-state"><strong>No steps in this module</strong></div>';
    return `<div class="minimal-training">
      <div class="progress-compact"><div><strong>${percent}%</strong><span>${completed.length}/${allTasks.length} tasks</span></div><div class="track"><i style="width:${percent}%"></i></div></div>
      <div class="task-line"><b>${this.activeTaskIndex + 1}/${taskItems.length}</b><span title="${this.escape(currentTask.text)}">${this.escape(currentTask.text)}</span></div>
      <label class="task ${done ? 'done' : ''} ${locked ? 'locked' : ''}"><input type="checkbox" data-task="${currentTask.id}" ${done ? 'checked' : ''} ${locked || this.saving ? 'disabled' : ''}/><span class="check">✓</span><span>${done ? 'Done' : locked ? 'Locked' : 'Complete'}</span></label>
      <nav class="step-nav" aria-label="Training steps"><button type="button" data-step-nav="previous" aria-label="Previous step" ${this.activeTaskIndex === 0 ? 'disabled' : ''}>←</button><button type="button" data-step-nav="next" aria-label="Next step" ${this.activeTaskIndex >= taskItems.length - 1 ? 'disabled' : ''}>→</button></nav>
    </div>`;
  }

  escape(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host{position:fixed;z-index:2147483000;inset:0;display:none;pointer-events:none;font-family:Inter,system-ui,sans-serif;color:#202825}:host([open]){display:block}.panel{position:absolute;top:0;right:0;display:flex;width:min(420px,calc(100vw - 24px));height:100%;pointer-events:auto;flex-direction:column;background:#f7f5ef;box-shadow:-18px 0 55px rgba(20,28,25,.22)}.panel>header{display:flex;min-height:68px;align-items:center;justify-content:space-between;border-bottom:1px solid #d9d5c9;background:#fff;padding:10px 16px}.identity{display:flex;align-items:center;gap:11px}.identity>span{display:grid;width:38px;height:38px;place-items:center;border-radius:8px;background:#a37813;color:#fff}.identity svg{width:25px;height:25px}.identity div{display:grid;gap:2px}.identity strong{font-size:13px}.identity small{color:#718079;font-size:10px;font-weight:700;text-transform:uppercase}.close{display:grid;width:36px;height:36px;place-items:center;border:1px solid #d7d2c6;border-radius:7px;background:#fff;color:#4b5752;font-size:22px;cursor:pointer}.content{flex:1;overflow:auto;padding:16px}.module-heading span{color:#8a6916;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.module-heading h2{margin:6px 0 5px;font-family:Georgia,serif;font-size:25px;font-weight:500}.module-heading p{margin:0;color:#65716c;font-size:11px;line-height:1.55}.meter{margin:16px 0;border:1px solid #d9d3c5;border-radius:8px;background:#fff;padding:12px}.meter>div:first-child{display:flex;align-items:baseline;justify-content:space-between}.meter strong{font-size:21px;color:#315d55}.meter span{color:#718079;font-size:10px}.track{height:6px;margin-top:8px;overflow:hidden;border-radius:4px;background:#e3e6df}.track i{display:block;height:100%;border-radius:inherit;background:#315d55;transition:width .2s}.lessons{display:grid;gap:10px}.lesson{border:1px solid #d9d3c5;border-radius:9px;background:#fff;padding:13px}.lesson.complete{border-color:#a9c9bd}.lesson header{display:flex;gap:10px;align-items:center}.lesson header>b{display:grid;width:30px;height:30px;place-items:center;border-radius:50%;background:#eee9dc;color:#745b1d;font-size:10px}.lesson.complete header>b{background:#dcebe5;color:#27604f}.lesson h3{margin:0;font-size:12px}.lesson small{color:#87918d;font-size:9px}.lesson>p{margin:9px 0;color:#65716c;font-size:10px;line-height:1.5}.tasks{display:grid;gap:6px}.task{display:grid;grid-template-columns:22px 1fr;align-items:start;gap:8px;border-radius:6px;background:#f6f4ee;padding:8px;color:#3e4a45;font-size:10px;line-height:1.45;cursor:pointer}.task input{position:absolute;opacity:0;pointer-events:none}.check{display:grid;width:18px;height:18px;place-items:center;border:1px solid #b9c0ba;border-radius:4px;background:#fff;color:transparent;font-size:11px}.task.done{background:#e9f2ee;color:#315d55}.task.done .check{border-color:#315d55;background:#315d55;color:#fff}.task.locked{cursor:not-allowed;opacity:.5}.complete-banner{margin:-4px 0 12px;border-radius:7px;background:#315d55;padding:10px;color:#fff;text-align:center;font-size:11px;font-weight:800}.message{border-top:1px solid #d9d5c9;background:#fff;padding:9px 16px;color:#315d55;font-size:10px}.state{display:grid;min-height:60vh;place-items:center;align-content:center;text-align:center}.state strong{margin-top:12px}.state p{max-width:290px;color:#718079;font-size:11px;line-height:1.5}.state a,.retry{border:0;border-radius:6px;background:#315d55;padding:9px 14px;color:#fff;text-decoration:none;font:inherit;font-size:10px;font-weight:800;cursor:pointer}.academy-icon{display:grid;width:48px;height:48px;place-items:center;border-radius:10px;background:#a37813;color:#fff}.academy-icon svg{width:32px}.spinner{width:28px;height:28px;border:3px solid #d8ddd8;border-top-color:#315d55;border-radius:50%;animation:spin .8s linear infinite}.modules{display:flex;gap:6px;overflow:auto;margin-bottom:13px}.modules button{border:1px solid #d7d2c6;border-radius:6px;background:#fff;padding:7px;color:#5f6c66;font:inherit;font-size:9px;white-space:nowrap}.modules button.active{border-color:#315d55;background:#e8f1ed;color:#315d55}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:520px){.content{padding:12px}.panel{width:min(380px,calc(100vw - 12px))}}
      </style>
      <style>
        :host { inset: auto 0 0; }
        .panel { position: relative; top: auto; right: auto; width: 100%; height: auto; min-height: 230px; max-height: min(340px, 46vh); border-top: 1px solid #cfc9bc; box-shadow: 0 -16px 45px rgba(20,28,25,.2); }
        .panel > header { min-height: 52px; padding: 7px 16px; }
        .identity > span { width: 34px; height: 34px; }
        .identity svg { width: 22px; height: 22px; }
        .close { width: 34px; height: 34px; }
        .content { min-height: 0; padding: 12px 16px; }
        .training-layout { display: grid; grid-template-columns: minmax(260px,.75fr) minmax(420px,1.8fr); gap: 14px; max-width: 1500px; margin: 0 auto; }
        .training-overview { min-width: 0; }
        .module-heading h2 { overflow: hidden; margin: 4px 0 3px; font-size: 18px; text-overflow: ellipsis; white-space: nowrap; }
        .module-heading p { display: -webkit-box; overflow: hidden; font-size: 9px; line-height: 1.4; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
        .meter { margin: 9px 0 0; border: 0; background: transparent; padding: 0; }
        .meter strong { font-size: 14px; }
        .meter span { font-size: 9px; }
        .track { height: 4px; margin-top: 5px; }
        .current-step { display: grid; grid-template-columns: minmax(0,1fr) 180px; grid-template-rows: 1fr auto; gap: 8px 14px; border: 1px solid #d9d3c5; border-radius: 8px; background: #fff; padding: 11px 13px; }
        .step-copy { min-width: 0; }
        .step-copy > span { color: #8a6916; font-size: 8px; font-weight: 900; letter-spacing: .07em; text-transform: uppercase; }
        .step-copy h3 { margin: 3px 0; font-size: 13px; }
        .step-copy p { display: -webkit-box; overflow: hidden; margin: 0 0 5px; color: #65716c; font-size: 9px; line-height: 1.35; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
        .step-copy strong { display: block; font-size: 11px; line-height: 1.4; }
        .task { align-self: start; align-items: center; padding: 9px; font-size: 9px; }
        .step-nav { grid-column: 1 / -1; display: flex; justify-content: space-between; }
        .step-nav button { border: 1px solid #d7d2c6; border-radius: 6px; background: #fff; padding: 6px 9px; color: #53615b; font: inherit; font-size: 9px; font-weight: 800; cursor: pointer; }
        .step-nav button:disabled { cursor: not-allowed; opacity: .38; }
        .complete-banner { margin: 7px 0 0; padding: 6px; font-size: 9px; }
        .state { min-height: 145px; }
        .modules { margin-bottom: 7px; }
        @media (max-width: 760px) {
          .panel { width: 100%; max-height: 52vh; }
          .content { padding: 10px; }
          .training-layout { grid-template-columns: 1fr; }
          .training-overview { display: grid; grid-template-columns: 1fr auto; gap: 5px 12px; }
          .training-overview .modules { grid-column: 1 / -1; }
          .training-overview .meter { min-width: 110px; }
          .module-heading p { display: none; }
          .current-step { grid-template-columns: 1fr; }
          .task, .step-nav { grid-column: 1; }
        }
      </style>
      <style>
        .panel { position: relative; width: 100%; height: 68px; min-height: 0; max-height: none; overflow: hidden; background: #fff; }
        .content { min-height: 0; overflow: hidden; padding: 9px 58px 9px 14px; }
        .minimal-training { display: grid; grid-template-columns: 145px minmax(180px,1fr) auto auto; height: 50px; max-width: 1500px; margin: 0 auto; align-items: center; gap: 12px; }
        .progress-compact { min-width: 0; }
        .progress-compact > div:first-child { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
        .progress-compact strong { color: #315d55; font-size: 13px; }
        .progress-compact span { color: #718079; font-size: 9px; white-space: nowrap; }
        .progress-compact .track { height: 4px; margin-top: 4px; }
        .task-line { display: flex; min-width: 0; align-items: center; gap: 9px; }
        .task-line b { flex: 0 0 auto; border-radius: 5px; background: #eee9dc; padding: 5px 7px; color: #745b1d; font-size: 9px; }
        .task-line span { overflow: hidden; font-size: 11px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
        .task { display: flex; grid-template-columns: none; align-self: auto; padding: 7px 9px; white-space: nowrap; }
        .step-nav { display: flex; grid-column: auto; gap: 5px; }
        .step-nav button { display: grid; width: 30px; height: 30px; place-items: center; padding: 0; font-size: 13px; }
        .close { position: absolute; top: 50%; right: 12px; width: 32px; height: 32px; transform: translateY(-50%); }
        .minimal-state { display: flex; height: 50px; align-items: center; justify-content: center; gap: 10px; color: #53615b; font-size: 10px; }
        .minimal-state span { overflow: hidden; max-width: 55vw; text-overflow: ellipsis; white-space: nowrap; }
        .minimal-state a, .minimal-state .retry { border: 0; border-radius: 5px; background: #315d55; padding: 7px 10px; color: #fff; font: inherit; font-weight: 800; text-decoration: none; }
        .spinner { width: 18px; height: 18px; }
        .identity > span, .academy-icon { background: #f0ca2e; color: #202825; }
        .module-heading span, .step-copy > span { color: #745e0e; }
        .meter strong, .progress-compact strong, .message { color: #745e0e; }
        .track i { background: #f0ca2e; }
        .lesson.complete { border-color: #e0bd29; }
        .lesson.complete header > b, .task.done { background: #fff7d1; color: #745e0e; }
        .task.done .check { border-color: #f0ca2e; background: #f0ca2e; color: #202825; }
        .complete-banner, .minimal-state a, .minimal-state .retry { background: #f0ca2e; color: #202825; }
        .minimal-state a:hover, .minimal-state .retry:hover { background: #d7b222; }
        .spinner { border-top-color: #f0ca2e; }
        .modules button.active { border-color: #d7b222; background: #fff7d1; color: #745e0e; }
        .step-nav button:not(:disabled) { border-color: #f0ca2e; background: #f0ca2e; color: #202825; }
        .step-nav button:not(:disabled):hover { border-color: #d7b222; background: #d7b222; }
        @media (max-width: 680px) {
          .panel { width: 100%; height: 76px; max-height: none; }
          .content { padding: 8px 50px 8px 8px; overflow-x: auto; }
          .minimal-training { grid-template-columns: 105px minmax(190px,1fr) auto auto; width: max(620px,100%); height: 58px; gap: 8px; }
          .task-line span { font-size: 10px; }
        }
      </style>
      <div class="panel" role="dialog" aria-modal="false" aria-label="App training">
        <main class="content">${this.renderContent()}</main>
        <button class="close" type="button" aria-label="Close training">×</button>
      </div>`;
    this.shadowRoot.querySelector('.close')?.addEventListener('click', () => this.close());
    this.shadowRoot.querySelector('.retry')?.addEventListener('click', () => this.load());
    this.shadowRoot.querySelectorAll('[data-module]').forEach((button) => button.addEventListener('click', () => { this.activeModuleId = button.dataset.module; this.activeTaskIndex = 0; this.message = ''; this.render(); }));
    this.shadowRoot.querySelectorAll('[data-step-nav]').forEach((button) => button.addEventListener('click', () => {
      this.activeTaskIndex += button.dataset.stepNav === 'next' ? 1 : -1;
      this.render();
    }));
    this.shadowRoot.querySelectorAll('[data-task]').forEach((input) => input.addEventListener('change', () => {
      const module = this.modules.find((item) => item.id === this.activeModuleId) || this.modules[0];
      this.toggleTask(module, input.dataset.task);
    }));
  }
}

function openStudioTraining(appId = currentStudioApp()) {
  if (!TRAINING_APPS.has(appId)) return false;
  let panel = document.querySelector('girih-training-panel');
  if (!panel) {
    panel = document.createElement('girih-training-panel');
    document.body.append(panel);
  }
  panel.openFor(appId);
  return true;
}

class GirihAppIcon extends HTMLElement {
  static get observedAttributes() { return ['app']; }
  constructor() { super(); this.attachShadow({ mode: 'open' }); }
  connectedCallback() { this.render(); }
  attributeChangedCallback() { this.render(); }
  render() {
    const app = this.getAttribute('app') || 'girih';
    this.shadowRoot.innerHTML = `<style>:host{display:inline-grid;width:100%;height:100%;place-items:center;color:inherit}:host svg,:host img{display:block;width:100%;height:100%;object-fit:contain}</style>${APP_ICONS[app] || APP_ICONS.girih}`;
  }
}

class GirihAppSwitcher extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.apps = FALLBACK_APPS;
    this.open = false;
    this.handleDocumentPointer = (event) => {
      if (!this.contains(event.target) && !event.composedPath().includes(this)) this.setOpen(false);
    };
  }

  connectedCallback() {
    this.render();
    document.addEventListener('pointerdown', this.handleDocumentPointer);
    fetch(new URL('./apps.json', import.meta.url))
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('App registry unavailable')))
      .then((apps) => {
        if (Array.isArray(apps) && apps.length) {
          this.apps = apps;
          this.renderItems();
        }
      })
      .catch(() => {});
  }

  disconnectedCallback() {
    document.removeEventListener('pointerdown', this.handleDocumentPointer);
  }

  setOpen(nextOpen) {
    this.open = Boolean(nextOpen);
    const button = this.shadowRoot.querySelector('button');
    const menu = this.shadowRoot.querySelector('.menu');
    if (button) button.setAttribute('aria-expanded', String(this.open));
    if (menu) menu.hidden = !this.open;
  }

  renderItems() {
    const list = this.shadowRoot.querySelector('.app-list');
    if (!list) return;
    list.replaceChildren();
    const currentApp = this.getAttribute('current-app') || '';
    this.apps.forEach((app) => {
      const link = document.createElement('a');
      const comingSoon = app.status === 'coming-soon' || !app.url;
      const academyAppContext = app.id === 'academy' && ['girih', 'bricks', 'muqarnas', 'mehraz'].includes(currentApp)
        ? `${app.url}${app.url.includes('?') ? '&' : '?'}app=${encodeURIComponent(currentApp)}`
        : app.url;
      link.href = comingSoon ? '#' : academyAppContext;
      link.className = `${app.id === currentApp ? 'app current' : 'app'}${app.id === 'academy' ? ' training' : ''}${comingSoon ? ' coming-soon' : ''}`;
      link.setAttribute('role', 'menuitem');
      if (!comingSoon && app.id === 'academy' && TRAINING_APPS.has(currentApp)) {
        link.addEventListener('click', (event) => {
          event.preventDefault();
          this.setOpen(false);
          openStudioTraining(currentApp);
        });
      }
      if (comingSoon) {
        link.setAttribute('aria-disabled', 'true');
        link.addEventListener('click', (event) => event.preventDefault());
      }

      const mark = document.createElement('span');
      mark.className = `mark mark-${app.id}`;
      mark.innerHTML = APP_ICONS[app.id] || APP_ICONS.girih;
      const copy = document.createElement('span');
      copy.className = 'copy';
      const name = document.createElement('strong');
      name.textContent = app.name;
      const description = document.createElement('small');
      description.textContent = app.category || app.description || '';
      copy.append(name, description);
      link.append(mark, copy);
      if (comingSoon) {
        const current = document.createElement('i');
        current.textContent = 'Soon';
        link.append(current);
      } else if (app.id === currentApp) {
        const current = document.createElement('i');
        current.textContent = 'Current';
        link.append(current);
      }
      list.append(link);
    });
  }

  render() {
    const compact = this.hasAttribute('compact');
    const align = this.getAttribute('align') === 'left' ? 'left' : 'right';
    this.shadowRoot.innerHTML = `
      <style>
        :host { position: relative; display: inline-flex; flex: 0 0 auto; font-family: var(--girih-font-sans, Inter, system-ui, sans-serif); color: var(--girih-color-ink, #241e18); }
        button { display: inline-flex; height: 38px; min-width: ${compact ? '38px' : '86px'}; align-items: center; justify-content: center; gap: 7px; border: 1px solid var(--girih-color-border, #d8ccba); border-radius: var(--girih-radius-md, 8px); background: var(--girih-color-surface, #fffaf1); color: var(--girih-color-primary, #2f514c); padding: 0 ${compact ? '8px' : '11px'}; font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; }
        button:hover, button:focus-visible, button[aria-expanded="true"] { border-color: var(--girih-color-primary, #2f514c); background: var(--girih-color-primary-soft, #edf3f0); outline: none; }
        button svg { width: 17px; height: 17px; }
        .label { display: ${compact ? 'none' : 'inline'}; }
        .menu { position: absolute; z-index: 1000; top: calc(100% + 9px); ${align}: 0; width: min(310px, calc(100vw - 24px)); overflow: hidden; border: 1px solid var(--girih-color-border, #d8ccba); border-radius: var(--girih-radius-lg, 10px); background: var(--girih-color-surface, #fffaf1); box-shadow: var(--girih-shadow-panel, 0 18px 55px rgba(36,30,24,.18)); }
        .menu[hidden] { display: none; }
        .heading { padding: 13px 14px 10px; border-bottom: 1px solid var(--girih-color-border, #d8ccba); color: var(--girih-color-muted, #6f6254); font-size: 10px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
        .app-list { display: grid; gap: 4px; padding: 7px; }
        .app { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; align-items: center; gap: 10px; border-radius: 7px; color: inherit; padding: 9px; text-decoration: none; }
        .app:hover, .app:focus-visible { background: var(--girih-color-primary-soft, #edf3f0); outline: none; }
        .app.current { background: var(--girih-color-surface-soft, #f5efe4); }
        .app.training { background: #f0ca2e; color: #202825; }
        .app.training:hover, .app.training:focus-visible { background: #d7b222; }
        .mark { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 7px; background: var(--girih-color-primary, #2f514c); color: white; }
        .mark svg { width: 27px; height: 27px; }
        .mark img { width: 27px; height: 27px; object-fit: contain; filter: brightness(0) invert(1); }
        .mark-girih { background: #26727a; }
        .mark-bricks { background: #a55332; }
        .mark-muqarnas { background: #957018; }
        .mark-mehraz { background: #456f84; }
        .mark-academy { background: #f0ca2e; color: #202825; }
        .copy { display: grid; min-width: 0; gap: 3px; }
        .copy strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
        .copy small { overflow: hidden; color: var(--girih-color-muted, #6f6254); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
        .app i { color: var(--girih-color-primary, #2f514c); font-size: 9px; font-style: normal; font-weight: 850; }
        .app.coming-soon { cursor: default; opacity: .68; }
      </style>
      <button type="button" aria-haspopup="menu" aria-expanded="false" aria-label="Open Girih Studio apps">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        <span class="label">Apps</span>
      </button>
      <div class="menu" role="menu" hidden>
        <div class="heading">Girih Studio apps</div>
        <div class="app-list"></div>
      </div>
    `;
    this.shadowRoot.querySelector('button').addEventListener('click', () => this.setOpen(!this.open));
    this.renderItems();
  }
}

if (!customElements.get('girih-training-panel')) customElements.define('girih-training-panel', GirihTrainingPanel);
if (!customElements.get('girih-app-switcher')) customElements.define('girih-app-switcher', GirihAppSwitcher);
if (!customElements.get('girih-app-icon')) customElements.define('girih-app-icon', GirihAppIcon);

window.GirihTrainingPanel = { open: openStudioTraining };
document.addEventListener('click', (event) => {
  const link = event.target.closest?.('a[href*="/training"]');
  const appId = currentStudioApp();
  if (!link || !TRAINING_APPS.has(appId) || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const url = new URL(link.href, window.location.href);
  if (url.hostname !== 'girihstudio.com' && url.hostname !== window.location.hostname) return;
  event.preventDefault();
  openStudioTraining(appId);
});

function upgradeAppMarks(root = document) {
  root.querySelectorAll?.('.academy-app-mark').forEach((mark) => {
    if (mark.querySelector('girih-app-icon')) return;
    const appClass = [...mark.classList].find((className) => className.startsWith('app-')) || 'app-academy';
    const icon = document.createElement('girih-app-icon');
    icon.setAttribute('app', appClass.slice(4));
    mark.replaceChildren(icon);
  });
}

function installTrainingButtonTheme() {
  if (document.getElementById('girih-training-button-theme')) return;
  const style = document.createElement('style');
  style.id = 'girih-training-button-theme';
  style.textContent = `
    .girih-training-button {
      border-color: #f0ca2e !important;
      background: #f0ca2e !important;
      color: #202825 !important;
    }
    .girih-training-button:hover,
    .girih-training-button:focus-visible {
      border-color: #d7b222 !important;
      background: #d7b222 !important;
      color: #202825 !important;
    }
  `;
  document.head.append(style);
}

function renameInAppTrainingLinks(root = document) {
  if (!TRAINING_APPS.has(currentStudioApp())) return;
  const links = [
    ...(root.matches?.('a[href*="/training"]') ? [root] : []),
    ...(root.querySelectorAll?.('a[href*="/training"]') || []),
  ];
  links.forEach((link) => {
    // Every training action inside a recognized Studio app is a button-like
    // control, even when an app uses generated utility classes or a div-based
    // header rather than the shared semantic header markup.
    link.classList.add('girih-training-button');
    link.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE && /academy/i.test(node.textContent || '')) {
        node.textContent = node.textContent.replace(/academy/gi, 'Training');
      }
    });
    if (/academy/i.test(link.getAttribute('aria-label') || '')) link.setAttribute('aria-label', link.getAttribute('aria-label').replace(/academy/gi, 'Training'));
    if (/academy/i.test(link.getAttribute('title') || '')) link.setAttribute('title', link.getAttribute('title').replace(/academy/gi, 'Training'));
  });
}

installTrainingButtonTheme();
upgradeAppMarks();
renameInAppTrainingLinks();
new MutationObserver((mutations) => mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
  if (node.nodeType === Node.ELEMENT_NODE) {
    upgradeAppMarks(node);
    renameInAppTrainingLinks(node);
  }
}))).observe(document.documentElement, { childList: true, subtree: true });
