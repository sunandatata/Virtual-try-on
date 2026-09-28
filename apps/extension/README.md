# Virtual Try-On Chrome Extension

Manifest V3 extension built with React, strict TypeScript, Vite, Tailwind, Zod, IndexedDB, Vitest, and Playwright.

The side panel is queue-first: collect and review garments from different stores, select up to five for sequential generation with a consented body profile, compare two to four completed results, and organize favorites and custom collections. Local readiness checks explain image concerns before a provider credit is requested.

Run `npm run build -w @virtual-try-on/extension`, then load `apps/extension/dist` from `chrome://extensions` in Developer mode. The toolbar action opens `sidepanel.html`; the image context menu and user-triggered picker are coordinated by `background.js`. `fixture.html` is packaged as the synthetic shopping test page.

Images live in IndexedDB. Settings and the resumable signed job token use `chrome.storage.local`. Configure the API in the options page; localhost is the default. For a production package, set `VITE_PRODUCTION_API_ORIGIN` before building so only that HTTPS API origin is declared as optional access.

Create the distributable artifact with `npm run package:extension`. See the root README for the complete workflow, permission rationale, privacy behavior, and manual Chrome checklist.
