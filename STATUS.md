# Project Status

## Cross-store differentiation complete - 2026-09-28

- Completed all eight ordered milestones: persistent universal queue, explicit-action metadata extraction and review, narrow queue UI, recoverable sequential batches, two-to-four-item comparison, favorites and collections, reusable body profiles, and explainable readiness checks.
- Queue items retain retailer-neutral product context, local assets, status/error history, results, favorites, collection membership, notes, ranks, and source links. Duplicate variants require explicit confirmation.
- Batches persist the selected profile and image revision, process at most five garments sequentially, recover after service-worker suspension, and avoid automatic resubmission after an ambiguous provider handoff.
- Body profiles remain in IndexedDB, migrate safely from the legacy photo, use per-profile consent, reset consent after replacement, and cannot be replaced or deleted during active generation.
- Readiness review runs locally before provider confirmation and reports Ready, May work, or Replace recommended with specific decode, type, size, resolution, aspect-ratio, thumbnail, and near-uniform explanations. Unsafe files block submission; safe low-quality inputs require an explicit override.
- Full validation passed: formatting, lint, strict type checking, 96 unit/component/API tests (API 23, extension 68, shared 5), production backend and extension builds, the Playwright unpacked-extension workflow, and extension packaging.
- Generated dependencies, `.env.local`, `.next`, `dist`, Playwright output, test samples, and the release ZIP remain ignored and untracked. No body photos, secrets, or machine-specific files were staged.
- Remaining external release work: run a real FASHN generation with a user-supplied backend key, complete the documented native Chrome checks, configure the production origin/rate limiter, and publish final privacy/contact details. Later product roadmap remains deliberately out of scope.

## Cross-store differentiation started - 2026-09-27

- Repositioned the product around a universal local queue: collect garments from different stores, generate selected items with the same body profile, compare results, and return to original listings.
- FASHN remains only the optional generation engine; retailer-neutral capture, metadata review, queueing, batch control, comparison, organization, profiles, readiness guidance, and privacy are extension-owned behavior.
- Durable specification, roadmap, README, and privacy requirements now cover eight ordered milestones and keep outfit building, sharing, monitoring, alternatives, additional browsers, and mobile integration out of scope until the core is stable.
- Locked product defaults: queue-first landing, review before save, warn-and-allow duplicate variants, five-item batch cap, per-profile consent, and optional collection templates.
- Next milestone: implement the IndexedDB queue/assets/drafts repository and safe migration from the existing single garment/result slots.

## Contribution audit and API boundary coverage - 2026-09-27

- Audited the clean, synchronized `main` history and confirmed the low contribution count came
  from grouping the initial 83-file, 13,794-insertion implementation into one large commit. No
  history was rewritten or backdated.
- Replaced the suggested per-session commit count with a policy to commit every independently
  reviewable, validated unit while keeping coupled implementation and tests together. Fake,
  padded, or contribution-only commits remain prohibited.
- Added direct upload-route coverage for the configured access code, unsupported MIME types,
  oversized files, corrupt image bytes, and the per-client request limit.
- Added signed status/result route coverage for malformed or wrong-purpose tokens, mock job state,
  untrusted result hosts, and defensive FASHN CDN image proxy headers.
- Full verification passed: formatting, linting, strict type-checking, production backend and
  extension builds, 38 unit tests (API 23, extension 11, shared 4), and the Playwright extension
  workflow (1 test).
- Next milestone remains a real FASHN generation after the user supplies an API key locally, plus
  the documented native Chrome release checks. Neither can be completed honestly without that
  external credential/user interaction.

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
