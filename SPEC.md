# Virtual Try-On Product Specification

## Product

Virtual Try-On is a Chromium Manifest V3 extension with a server-only try-on API. Its defining experience is: **try on and compare clothing from different stores without leaving the shopping experience**. A shopper keeps body profiles and a cross-store garment queue privately in IndexedDB, explicitly collects products while browsing, submits selected items to the configured generation provider, and compares approximate results linked back to the original listings.

FASHN remains an interchangeable image-generation engine, not the product experience. The extension owns collection, product context, local organization, batch control, comparison, readiness guidance, privacy, and the path back to purchase. Results never claim sizing, measurements, fabric drape, or fit accuracy.

## Durable requirements

- npm-workspaces monorepo: `apps/extension`, `apps/api`, and `packages/shared`.
- Extension: React, strict TypeScript, Vite MV3 build, Tailwind, Zod, IndexedDB, toolbar side panel, service worker, isolated garment picker, image context menu, options/settings, typed validated messages, local synthetic fixture, icons, unpacked build, and ZIP.
- API: current stable Next.js App Router, strict TypeScript, server-only routes, Zod validation, provider abstraction, mock and FASHN providers, signed stateless polling tokens, exact CORS allowlist, access-code support, timeouts, safe errors, and a production-capable rate-limit adapter.
- Required routes: `GET /api/health`, `POST /api/try-on`, `GET /api/try-on/status`, and safe same-origin result delivery where applicable.
- Store body photos only in extension IndexedDB. Never inject them into shopping pages. Do not persist uploaded images on the backend or log image data/secrets.
- No page inspection or collection before explicit user action. Do not send data until Generate is pressed. Never accept a backend remote garment URL.
- Picker highlights eligible standard images, supports keyboard focus/Escape, blocks accidental navigation, uses `currentSrc`, cleans up completely, and offers an immediate upload fallback on protected content.
- Context-menu selection opens the panel and preserves the selected image reference so the user does not need to repeat selection.
- Person images: JPEG/PNG/WebP, <=10 MB before processing, decodable, locally resized/compressed when excessive; HEIC is intentionally unsupported unless reliable browser-native decoding exists.
- Garments: JPEG/PNG/WebP, <=10 MB, decodable, drag/drop, preview, replace/remove.
- Categories map `dress` -> `one-pieces`, `top` -> `tops`, `bottom` -> `bottoms`.
- Generation statuses: `idle`, `submitting`, `processing`, `succeeded`, `failed`; duplicate submission prevention, progressive status, retry, state recovery.
- Results show body, garment, demo/real result, download, try another garment, change photo, reset, and approximation notice. Mock output is unmistakably labeled Demo result.
- Settings replace/delete body photo, clear local data, configure development API URL and optional access code, and link privacy details.
- Accessibility: semantic controls, keyboard support, visible focus, live announcements, contrast, reduced motion, loading/empty/error states.
- Minimum permissions: `sidePanel`, `activeTab`, `scripting`, `storage`, `contextMenus`; backend origins are optional host permissions requested during an explicit generate action. No broad install-time site access.
- Extension CSP disallows remote executable code. Production CORS is never wildcard.
- Mock mode works without credentials and supports deterministic delayed success plus controlled test failure.
- FASHN integration uses `tryon-v1.6`, `POST https://api.fashn.ai/v1/run`, bearer auth, `model_image`, `garment_image`, mapped categories, status polling at `/v1/status/:id`, and base64/data URI image inputs. Provider key remains backend-only.
- A local synthetic shopping fixture covers product, responsive, tiny/decorative, and difficult-image cases.
- Documentation includes setup, commands, permissions, privacy, deployment, packaging, manual checks, limitations, and FASHN configuration.

## Cross-store product requirements

- The post-onboarding landing experience is a persistent local try-on queue.
- Queue items retain their garment image, product context, category, timestamps, ordering, favorite and collection state, generation lifecycle, retry information, and generated result.
- Picker, context-menu, and manual-upload captures open a review step before saving. Best-effort metadata is visibly suggested until the user confirms or edits it.
- Metadata extraction runs only after explicit capture action, is retailer-neutral, remains local, and never sends page contents to the backend.
- Likely duplicates warn and stop by default while offering an explicit **Add as variant** override.
- Users may select at most five queue items per confirmed batch. Jobs run sequentially and survive side-panel closure and service-worker suspension.
- Comparison accepts two to four completed items and persists local ranks, winner, favorites, and notes.
- Favorites, user-created collections, reusable body profiles, and explainable local input-readiness checks are stored only in extension IndexedDB.
- Consent is recorded per body profile; replacing a profile image resets its consent. Active-job profiles cannot be replaced or deleted.
- Readiness checks may identify decoding, size, resolution, aspect-ratio, thumbnail, and nearly uniform image concerns, but never infer measurements, fit, identity, or guaranteed provider quality.

## Acceptance criteria

1. Root formatting, lint, typecheck, unit/component/API tests, build, and extension packaging commands pass.
2. The extension output is loadable unpacked and a distributable ZIP exists.
3. Toolbar action and image context menu open the side panel.
4. Body-photo save, replacement, deletion, consent, and clear-all behavior work locally.
5. Picker works on the fixture; manual upload is always available.
6. Mock submission, polling, obvious demo result, download control, retry/reset, and reopening recovery work.
7. FASHN adapter request/status normalization and signed job-token integrity are tested.
8. API rejects invalid MIME, size, decoding, request, access, token, origin, and rate-limit cases with normalized errors.
9. Keys and image contents do not appear in extension bundles or logs; the API does not persist images.
10. Documentation and `STATUS.md` match verified reality; unexecuted interactive Chrome checks are identified explicitly.
11. Existing single-photo, picker, context-menu, mock, FASHN, security, and recovery behavior survives storage migrations.
12. Queue persistence, migration, metadata fallbacks, batch recovery, comparison, collections, profiles, and readiness rules have focused automated coverage.
13. Page metadata and saved body photos never enter shopping-page DOM or backend metadata requests; generation sends only the selected profile, garment, category, and required API controls.

## Explicit exclusions

Accounts, billing, exact sizing, custom-model training, and automatic retailer scraping remain excluded. Outfit building, private share pages, price/availability monitoring, visually similar alternatives, non-Chromium support, and native mobile sharing are later roadmap items and must not be implemented before the eight cross-store milestones are stable.
