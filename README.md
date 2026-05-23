# Audiobook Engine

Internal production tool for Michele Scott's audiobook catalog — character detection, voice casting, and ElevenLabs CSV export.

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in Supabase, ElevenLabs, and Anthropic keys.
2. Set `ADMIN_EMAILS` to your email (comma-separated for multiple admins) to access **Team access** in the sidebar.
2. Run SQL migrations in `supabase/migrations/` via Supabase SQL Editor (in order).
3. `npm install`
4. `npm run dev` — open http://localhost:3000

## Seed Wine Lover's cast

After migrations `20250523000002_seed_wine_lovers.sql`:

```bash
npm run seed:voices
```

Requires `ELEVENLABS_API_KEY` in `.env.local`.

## Deploy (Vercel)

1. Import repo to Vercel.
2. Set environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ELEVENLABS_API_KEY`, `ANTHROPIC_API_KEY`.
3. Add production URL to Supabase Auth redirect URLs.

## Docs

- [BUILD_SPEC.md](BUILD_SPEC.md) — features and API
- [BRAND.md](BRAND.md) — design system
