const FALLBACK_APPS = [
  { id: 'girih', name: 'Girih App', url: 'https://girihstudio.com/app', description: 'Geometric pattern design', status: 'available' },
  { id: 'bricks', name: 'Bricks App', url: 'https://bricks.girihstudio.com', description: 'Brick pattern design', status: 'available' },
  { id: 'muqarnas', name: 'Muqarnas App', url: 'https://muqarnas.girihstudio.com', description: 'Muqarnas design', status: 'available' },
  { id: 'mehraz', name: 'Mehraz App', url: 'https://mehraz.girihstudio.com', description: 'Architectural composition', status: 'available' },
  { id: 'academy', name: 'Girih Studio Academy', url: 'https://girihstudio.com/training', description: 'Training and assessment', status: 'available' },
];

const APP_ICONS = {
  girih: '<img src="https://girihstudio.com/design/icons/girih.png" alt="" aria-hidden="true" />',
  bricks: '<img src="https://girihstudio.com/design/icons/bricks.png" alt="" aria-hidden="true" />',
  muqarnas: '<img src="https://girihstudio.com/design/icons/muqarnas.png" alt="" aria-hidden="true" />',
  mehraz: '<img src="https://girihstudio.com/design/icons/mehraz.png" alt="" aria-hidden="true" />',
  academy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="m3 8 9-4 9 4-9 4-9-4Z"/><path d="M7 10.5V15c2.7 2 7.3 2 10 0v-4.5M21 8v7"/></svg>',
};

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
      link.className = `${app.id === currentApp ? 'app current' : 'app'}${comingSoon ? ' coming-soon' : ''}`;
      link.setAttribute('role', 'menuitem');
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
        .mark { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 7px; background: var(--girih-color-primary, #2f514c); color: white; }
        .mark svg { width: 27px; height: 27px; }
        .mark img { width: 27px; height: 27px; object-fit: contain; filter: brightness(0) invert(1); }
        .mark-girih { background: #26727a; }
        .mark-bricks { background: #a55332; }
        .mark-muqarnas { background: #957018; }
        .mark-mehraz { background: #456f84; }
        .mark-academy { background: #a37813; }
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

if (!customElements.get('girih-app-switcher')) customElements.define('girih-app-switcher', GirihAppSwitcher);
if (!customElements.get('girih-app-icon')) customElements.define('girih-app-icon', GirihAppIcon);

function upgradeAppMarks(root = document) {
  root.querySelectorAll?.('.academy-app-mark').forEach((mark) => {
    if (mark.querySelector('girih-app-icon')) return;
    const appClass = [...mark.classList].find((className) => className.startsWith('app-')) || 'app-academy';
    const icon = document.createElement('girih-app-icon');
    icon.setAttribute('app', appClass.slice(4));
    mark.replaceChildren(icon);
  });
}

upgradeAppMarks();
new MutationObserver((mutations) => mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
  if (node.nodeType === Node.ELEMENT_NODE) upgradeAppMarks(node);
}))).observe(document.documentElement, { childList: true, subtree: true });
