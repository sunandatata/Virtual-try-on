# Project Status

## Repository workflow and CI - 2026-09-27

- Added root repository instructions for meaningful, reviewable commits; explicit staging; secret and large-file review; safe synchronization; and complete push reports.
- Expanded ignore coverage for framework output, local caches, editor files, temporary media, local databases, uploads, and generated release artifacts while retaining `.env.example` and synthetic fixtures.
- Added least-privilege GitHub Actions CI for pushes and pull requests to `main`. CI installs from the lockfile on the current Node.js LTS release, then checks formatting, linting, types, unit tests, and production builds for the shared package, backend, and extension.
- Playwright remains a documented local/manual release check because native Chrome extension surfaces are not reliably testable on a standard headless CI runner.
- Next milestone: configure and verify a real FASHN generation after the user stores an API key locally; never commit that credential.

## Final implementation — 2026-09-26

All six implementation milestones are complete. The workspace began empty, so there was no earlier web application to migrate or remove. Git was initialized and the product was built extension-first as specified.

### Delivered

- npm-workspaces monorepo with `apps/extension`, `apps/api`, and `packages/shared`.
- Chrome 116+ MV3 extension with toolbar/Side Panel integration, image context menu, explicitly injected isolated picker, typed message validation, options page, IndexedDB image storage, local image decode/resize/compression, upload fallback, resumable job state, results/download/reset actions, icons, fixture, unpacked build, and ZIP.
- Premium narrow-panel UI covering onboarding/consent, ready, processing, result, error/retry, settings, privacy, deletion, empty, and loading states. Replacement of a body photo resets consent.
- Next.js 16 App Router backend with health, multipart submission, status, and restricted result-proxy routes; Sharp decode validation; exact CORS/access checks; development and Upstash rate-limit adapters; timeouts; normalized errors; and no image persistence.
- Provider-neutral mock and FASHN adapters. Current official docs were checked: stable `tryon-v1.6` uses `POST /v1/run`, bearer authentication, `model_image`, `garment_image`, supported category values, and `/v1/status/:id` polling.
- Stateless HMAC-signed polling tokens containing only provider kind/reference, readiness metadata for the deterministic mock, and expiration. Mock output is a generated, unmistakably labeled illustration and does not carry or persist the user's images.
- Root/package documentation, privacy draft, environment template, permission rationale, deployment guidance, limitations, and manual Chrome checklist.

### Verification evidence

- `npm run format:check` — passed.
- `npm run lint` — passed for all three workspaces.
- `npm run typecheck` — passed in strict mode for all three workspaces.
- `npm test` — passed: API 10, extension 11, shared 4 (25 total).
- `npm audit` — passed with 0 known production or development vulnerabilities after upgrading Sharp and Vitest.
- `npm run build` — passed. Next.js produced `/api/health`, `/api/try-on`, `/api/try-on/status`, and `/api/try-on/result`; Vite produced the loadable MV3 directory at `apps/extension/dist`.
- `npm run test:e2e` — passed in Playwright's full Chromium channel. The persistent-context test exercised the synthetic shop, real picker/content-script/background selection, consent, IndexedDB uploads, intercepted mock submit/poll/result, processing, error/retry, download control, start-over, manual upload, settings, local-data deletion, and Escape cleanup.
- `npm run package:extension` — passed and produced `apps/extension/release/virtual-try-on-0.1.0.zip`.
- Built standalone backend smoke test — health, real multipart mock submission, signed-token polling, and labeled deterministic result all succeeded.
- Visual QA — inspected first-run, ready-with-garment, processing, error, result, settings, and high-DPI picker screenshots at a 360 px panel width with reduced-motion coverage. No clipping, overflow, broken assets, or unreadable actions remained.
- Artifact/security audit — manifest contains only the five required core permissions plus the configured optional localhost API origin, restrictive CSP, Chrome 116 minimum, local icons, and no static shopping-site content script. Extension bundles contain no provider key, job secret, access code, FASHN endpoint, `eval`, or `new Function` references.

### Architecture decisions

- Vite multi-entry MV3 was chosen over WXT so background/content/side-panel/options boundaries and generated manifest permissions remain explicit.
- The picker supports standard `<img>` elements and uses `currentSrc`, Shadow DOM UI, eligibility filtering, pointer/keyboard selection, navigation prevention, and immediate cleanup.
- Protected/blob/canvas/background-image cases use the always-present manual screenshot upload. Automatic screenshot cropping is intentionally not guessed because zoom, DPR, scroll, and gallery transforms can select the wrong pixels.
- Production result URLs are never handed directly to the extension from an arbitrary host. Only a signed `cdn.fashn.ai` URL can pass through the expiring result proxy.
- The development memory rate limiter is intentionally replaceable; public deployment requires the documented Upstash configuration.

### Remaining manual release checks / limitations

- Playwright verifies the unpacked extension and its pages but cannot assert Chrome's native toolbar pin, Side Panel frame, context-menu placement, optional-permission bubble, or OS download shelf. The connected-browser security policy also blocks `chrome://extensions`, so no workaround was attempted. The root README contains exact manual checks for those browser UI surfaces.
- Real FASHN generation was not called because no external API key was supplied. The adapter request/status behavior is unit-tested and configuration-ready.
- HEIC/HEIF is not advertised because reliable native Chromium decoding is unavailable without a substantial converter.
- Automatic cropping of protected images is not implemented; manual upload is the safe fallback.
- Before Web Store publication, the publisher must host `PRIVACY.md`, add publisher/contact/subprocessor details, build with the final HTTPS API origin, configure shared production rate limiting, and complete the native Chrome checklist.
