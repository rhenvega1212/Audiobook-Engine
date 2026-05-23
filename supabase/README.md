# Supabase setup

## 1. Create a Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a new project.
2. Under **Authentication → Providers**, enable **Email** and disable **Confirm email** if you want instant login for invited users (optional).
3. Under **Authentication → URL configuration**, set:
   - **Site URL**: `http://localhost:3000` (dev) and your Vercel URL (prod)
   - **Redirect URLs**: `http://localhost:3000/auth/callback`, `https://your-app.vercel.app/auth/callback`
4. Disable public signups: **Authentication → Providers → Email** → turn off “Enable sign up” (or leave signup off in the dashboard). Team accounts are created manually in **Authentication → Users → Add user**.

## 2. Apply the database schema

**Option A — SQL Editor (quickest)**

1. Open **SQL Editor** in the Supabase dashboard.
2. Run migrations in order (one file per query):
   - `20250522000001_initial_schema.sql`
   - `20250522000002_rls_policies.sql`
   - `20250523000001_storage.sql`
   - `20250523000002_seed_wine_lovers.sql`
   - `20250523000003_pronunciations.sql`
3. Then run `npm run seed:voices` locally to attach ElevenLabs voice IDs.

**Option B — Supabase CLI**

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

## 3. Copy API keys into the app

From **Project Settings → API**, copy into `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never commit)

## 4. Invite team members

**Authentication → Users → Add user** — create email/password accounts for each team member. There is no in-app signup form.
