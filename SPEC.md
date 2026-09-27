# Virtual Try-On MVP Specification

## Product

Virtual Try-On is a Chromium Manifest V3 extension with a server-only try-on API. A shopper opens the toolbar side panel, keeps a privately stored body photo in IndexedDB, selects a garment from the current page (or uploads a screenshot), and views a generated preview without leaving the shopping page. It is an approximate visual preview, never a sizing, measurement, drape, or fit guarantee.

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

## Explicit exclusions

Mobile apps, accounts, billing, social sharing, price tracking, exact sizing, video, non-Chromium support, scraping, cloud galleries, and custom-model training are outside this MVP.
