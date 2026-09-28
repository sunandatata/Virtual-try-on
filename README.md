# Virtual Try-On

Virtual Try-On is a privacy-conscious Chrome side-panel extension for collecting clothing from different stores, generating approximate previews with the same saved body profile, and comparing results without leaving the shopping experience. Product context, queues, profiles, results, favorites, and collections stay in extension IndexedDB. A person image and garment are transmitted only after the user explicitly confirms generation.

FASHN supplies the optional real image-generation engine. The product's differentiation is the universal shopping workflow around it: retailer-neutral capture, a persistent cross-store queue, controlled batch generation, local organization, and comparison linked back to original listings.

## Repository

- `apps/extension` — Manifest V3 React side panel, service worker, picker, settings, synthetic shop fixture, tests, and package build.
- `apps/api` — Next.js App Router API, input/security controls, stateless jobs, and mock/FASHN providers.
- `packages/shared` — Zod-validated cross-context messages, categories, statuses, and API contracts.
- `SPEC.md`, `PLAN.md`, `STATUS.md` — durable requirements, implementation milestones, and evidence log.
- `PRIVACY.md` — baseline disclosure text for deployment and Chrome Web Store review.

## Prerequisites and install

- Node.js 20 or newer (Node 24 is supported)
- npm 10 or newer
- Chrome 116 or newer

```powershell
npm install
Copy-Item .env.example apps/api/.env.local
npm run build
```

Use a random `JOB_TOKEN_SECRET` of at least 32 characters before any production deployment. Never place `FASHN_API_KEY` in extension configuration, source, or a `VITE_` variable.

## Commands

| Command                                   | Purpose                                                 |
| ----------------------------------------- | ------------------------------------------------------- |
| `npm run dev`                             | Run API and extension build watchers together           |
| `npm run dev:api`                         | Run the Next.js API at `http://localhost:3000`          |
| `npm run dev:extension`                   | Run the Vite extension development server               |
| `npm run lint`                            | Lint all workspaces                                     |
| `npm run format` / `npm run format:check` | Apply/check Prettier formatting                         |
| `npm run typecheck`                       | Type-check all workspaces                               |
| `npm test`                                | Run shared, API, and extension tests                    |
| `npm run test:e2e`                        | Run the unpacked-extension Playwright harness           |
| `npm run build`                           | Build shared contracts, backend, and unpacked extension |
| `npm run package:extension`               | Rebuild and create the Web Store ZIP                    |

## Local mock workflow

1. Copy `.env.example` to `apps/api/.env.local`; leave `TRYON_PROVIDER=mock`.
2. Set `ALLOWED_EXTENSION_ORIGINS` after Chrome assigns the unpacked extension ID. During the first local health check, missing-Origin server requests remain accepted outside production, while browser requests are exactly allowlisted.
3. Run `npm run dev:api`.
4. Run `npm run build -w @virtual-try-on/extension`.
5. Open `chrome://extensions`, enable Developer mode, select **Load unpacked**, and choose `apps/extension/dist`.
6. Pin Virtual Try-On, open its **Profiles** tab, and create a profile with `apps/extension/public/fixture/person.png`. Enable **Allow generation with this photo**.
7. In a tab, open `chrome-extension://EXTENSION_ID/fixture.html`. From **Queue**, pick the plum dress or upload `apps/extension/public/fixture/dress.png`, review the suggested metadata, choose **Dress / one-piece**, and add it to the queue.
8. Select one or more queued garments, choose the body profile, and press Generate. Review the local readiness guidance and confirm the exact provider-credit count. Chrome asks once for access to `http://localhost:3000`; approve it.
9. The sequential mock batch returns unmistakable **DEMO · NOT AI** results. Verify comparison, favorites, collections, source links, downloads, retries, profile replacement, and local-data deletion.

The fixture uses only locally generated geometric artwork. It includes product images, a responsive image, a tiny decorative icon that the picker ignores, and a data-URL case that exercises the upload fallback.

## Real FASHN generations

Current official documentation (checked 2026-09-26) lists `tryon-v1.6` as Stable and optimized for responsive e-commerce, using `POST https://api.fashn.ai/v1/run` with `model_image`, `garment_image`, and `category`, followed by `GET /v1/status/:id`. Obtain an API key from FASHN, then set only on the backend:

```dotenv
TRYON_PROVIDER=fashn
FASHN_API_KEY=replace-me
JOB_TOKEN_SECRET=replace-with-32-or-more-random-characters
ALLOWED_EXTENSION_ORIGINS=chrome-extension://your-production-extension-id
```

The extension categories map to FASHN `one-pieces`, `tops`, and `bottoms`. Inputs are sent as data URIs so FASHN never fetches arbitrary URLs supplied by a shopping page. The server returns signed opaque job tokens; successful CDN results pass through a verified, expiring backend proxy. Provider request timeouts and errors are normalized for the extension.

For a production backend, build the extension with the single configured HTTPS origin included in its optional permissions:

```powershell
$env:VITE_PRODUCTION_API_ORIGIN='https://tryon-api.example.com'
npm run package:extension
```

Then set that same origin in extension Settings. A runtime permission prompt appears only on explicit generation.

## Extension permissions

- `sidePanel` — hosts the primary experience beside the shop.
- `activeTab` — temporary access to the current tab after a user gesture.
- `scripting` — injects the picker only when **Select garment from this page** is pressed.
- `storage` — saves non-image settings and recoverable job state; images stay in IndexedDB.
- `contextMenus` — adds **Try this on with Virtual Try-On** to image menus.
- Optional backend origins — build-time development/production API origins only; requested on Generate. No blanket website access is installed.

No static `content_scripts` or broad shopping-site host permission exists. The extension does not scan pages in the background. All executable code is packaged locally and MV3 CSP allows scripts only from the extension.

## Privacy and security

The saved body photo is sensitive local data. It is never placed into a shopping DOM and is deleted by the individual photo action or **Clear all locally stored data**. The API validates declared and decoded image formats, size, category, origin, access code, rate limit, and signed polling token. It accepts binary multipart uploads, not remote garment URLs; it does not write inputs to disk or a database and code avoids image/secret logging.

Production deployments should configure Upstash REST credentials with `RATE_LIMIT_PROVIDER=upstash`; the memory limiter is development-only because serverless instances do not share memory. Review [PRIVACY.md](PRIVACY.md) and replace the placeholder hosted privacy link in the options page before publishing.

## Deploying the API to Vercel

Import the repository, set the project root to `apps/api`, keep the framework preset as Next.js, and configure every environment variable from `.env.example`. Include the final Chrome extension origin exactly. Configure Upstash before public traffic. After deployment, rebuild the extension with `VITE_PRODUCTION_API_ORIGIN`, set its backend URL, run all checks, and create a new ZIP.

## Automated and manual verification

`npm run test:e2e` launches a persistent high-DPI Chromium context with `apps/extension/dist`. It exercises tab navigation, picker activation and cleanup, IndexedDB uploads, queue metadata review, an intercepted mock submit/poll/result cycle, download control, error/retry rendering, start-over, local-data deletion, and settings. Focused component tests cover queue batches, comparison, collections, profiles, and readiness decisions. The backend's real mock multipart flow is covered separately by API tests. Native side-panel chrome, permission bubbles, context-menu placement, and the operating-system download shelf are browser UI surfaces that Playwright headless cannot fully assert; verify them manually:

- Toolbar click opens the panel on an HTTPS shop and on the fixture.
- Restricted `chrome://` selection shows a friendly fallback.
- Hover/focus outlines only eligible products; Escape removes all picker UI.
- Right-clicking the dress opens the panel with the same garment preview.
- Denied backend permission, offline API, bad access code, timeout, rate limit, and controlled mock failure preserve inputs and allow retry.
- Close/reopen the panel during processing and confirm polling resumes.
- Check 300–520 px widths, 125–200% display scaling, keyboard-only navigation, focus visibility, screen-reader announcements, and reduced-motion mode.
- Replace/delete the body photo, clear all local data, download a result, and reload the extension to confirm state.

Do not report these interactive checks as passed until performed in Chrome.

## MVP limitations and future work

- Standard `<img>` elements are supported. CSS backgrounds, canvas output, blob URLs, and protected authenticated images use the immediate upload fallback.
- The MVP does not attempt screenshot auto-cropping because inaccurate bounds under zoom/DPI/scroll could silently select the wrong garment.
- HEIC/HEIF is not advertised because Chromium has no consistently reliable native decoder; convert to JPEG/PNG/WebP first.
- The mock result is a deterministic labeled illustration, not a clothing transformation.
- No Amazon-specific scraper, accounts, billing, sizing, video, mobile integration, gallery, or non-Chromium support is included.
- A future release can add rigorously tested visible-tab cropping, a hosted privacy page, telemetry-free health diagnostics, and broader automated native-side-panel coverage as Chromium tooling improves.

## Cross-store roadmap

All eight ordered milestones are implemented: persistent queue, explicit-action metadata extraction, queue interface, safe sequential batches, comparison, collections, multiple body profiles, and explainable input-readiness checks. Outfit building, sharing, price monitoring, alternative discovery, non-Chromium browsers, and mobile sharing remain later roadmap items.
