# @girih-studio/design

Framework-neutral shared design package for Girih Studio applications.

- `theme.css` defines shared colors, typography, radii, buttons, brand links, and account controls.
- `apps.json` is the central registry used by the landing page and application switcher.
- `brand.json` exposes the canonical name, logo, home, and browser-package URLs.
- `app-switcher.js` registers the `<girih-app-switcher>` web component so applications can use the same navigation across React versions.
- The canonical Girih logo is served from the URL declared in `brand.json`.

The Girih build publishes these files at `https://girihstudio.com/design/`. Other applications consume the browser package from that stable URL and retain local CSS fallbacks for resilience.
