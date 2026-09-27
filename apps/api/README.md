# Virtual Try-On API

Next.js App Router backend for the Chrome extension. It exposes health, multipart submission, signed stateless status polling, and restricted provider-result delivery. Inputs are validated with Zod and Sharp, remain in memory only for each request, and are never accepted as arbitrary remote URLs.

Copy the root `.env.example` to `apps/api/.env.local`, keep `TRYON_PROVIDER=mock`, and run `npm run dev -w @virtual-try-on/api`. Set `TRYON_PROVIDER=fashn` plus a backend-only `FASHN_API_KEY` for real generation. Production also requires a strong `JOB_TOKEN_SECRET`, exact `ALLOWED_EXTENSION_ORIGINS`, and a shared rate limiter such as Upstash.

Deploy to Vercel with this directory as the project root. See the root README for environment details, privacy/security constraints, and FASHN configuration.
