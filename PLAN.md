# Implementation Plan

## Cross-store differentiation

1. [x] **Universal Try-On Queue** - add typed IndexedDB queue/assets/drafts, safe legacy migration, duplicate warnings, ordering, retry state, and capture from picker, context menu, and manual upload.
2. [x] **Product metadata extraction** - collect and sanitize explicit-selection JSON-LD, Open Graph, title, alt, nearby heading/price, URL, hostname, and variant hints with visible provenance and editable review.
3. [x] **Queue interface** - make the queue the post-onboarding landing view with narrow-panel cards, editing, filters, ordering, favorites, selection, source links, and complete states.
4. [x] **Safe batch generation** - confirm at most five jobs, run sequentially, persist progress, recover through Manifest V3 suspension, prevent duplicate submission, and retry failed items only.
5. [x] **Cross-store comparison** - compare two to four completed results with product context, narrow-screen navigation, ranks, winner, notes, downloads, source links, and approximation notice.
6. [x] **Favorites and collections** - persist local favorites and create/rename/delete/filter custom collections without deleting their items.
7. [x] **Multiple body profiles** - migrate the legacy photo, store per-profile consent, manage defaults and lifecycle, select a profile for generation, and protect profiles used by active jobs.
8. [x] **Input-readiness checks** - add explainable local decoding, size, dimension, aspect-ratio, thumbnail, and near-uniform checks with Ready/May work/Replace recommended guidance.

## Later roadmap only

- Outfit builder across stores.
- Private shareable comparison pages.
- Price-drop and availability monitoring.
- Visually similar alternative products.
- Browser support beyond Chromium.
- Native mobile sharing.

## Completed foundation

1. [x] **Foundation** — initialize Git/workspaces, record specification and decisions, add strict shared schemas and tooling.
2. [x] **Backend** — implement validation, CORS/access/rate-limit controls, signed stateless jobs, mock/FASHN adapters, routes, and tests.
3. [x] **Extension platform** — implement manifest/build, service worker, validated messages, IndexedDB, image processing, picker, and fixture.
4. [x] **Side-panel product** — implement onboarding, ready/upload, processing/results, persistence, settings/privacy, accessibility, and tests.
5. [x] **Packaging and documentation** — icons, production artifacts/ZIP, deployment/readmes/privacy, and manual checklist.
6. [x] **Verification** — formatting, lint, typecheck, unit/API/component tests, builds, packaging, supported Playwright checks, artifact/security audit, and status reconciliation.
