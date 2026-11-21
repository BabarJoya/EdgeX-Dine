# Going live: Supabase + Vercel setup

About 10 minutes, from a computer. You need a free [Supabase](https://supabase.com)
account and a [Vercel](https://vercel.com) account connected to GitHub.

## 1. Create the Supabase project

1. supabase.com → **New project**. Name it `edgex-production`.
   Pick the region closest to your customers (for Pakistan: **Mumbai `ap-south-1`**
   or Singapore). Save the database password in a password manager.
2. When it's ready, open **Project Settings → API** and copy:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **anon / publishable key**

   Do **not** copy the `service_role` / secret key anywhere in this project.

## 2. Create the database tables

On your computer, in this repository:

```bash
npm install
npx supabase login                       # opens the browser once
npx supabase link --project-ref <ref>    # <ref> = the abcd1234 part of the URL
npx supabase db push                     # applies everything in supabase/migrations
```

`db push` creates every table, security policy, role template and subscription
plan. Run it again whenever new migrations are added in later phases.

## 3. Auth settings (Supabase dashboard → Authentication)

| Setting                                     | Value                                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| URL Configuration → Site URL                | `https://<your-domain>` (or the Vercel URL)                                                                              |
| URL Configuration → Redirect URLs           | `https://<your-domain>/**` and `https://*-<vercel-team>.vercel.app/**` for previews                                      |
| Providers → Email → Confirm email           | **On**                                                                                                                   |
| Providers → Email → Minimum password length | 8                                                                                                                        |
| Emails → SMTP                               | Add your own SMTP (e.g. Resend, Brevo). The built-in sender is limited to a few emails per hour and is for testing only. |

## 4. Deploy on Vercel

1. vercel.com → **Add New → Project** → import `EdgeX-Dine`.
2. Framework is detected as Vite; `vercel.json` already sets build, rewrites and headers.
3. **Environment Variables** (Production):
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon key
4. Deploy. Open the site → **Create an account** → set up your restaurant.

Use a second Supabase project (e.g. `edgex-staging`) for the Vercel **Preview**
environment so test data never mixes with real restaurants.

## 5. Make yourself platform admin (optional, for Phase 6)

In Supabase → SQL editor, after signing up:

```sql
update public.profiles set is_platform_admin = true where email = 'you@example.com';
```

This flag can only be set from the dashboard; the app never lets users set it.

## Local development

Requires Docker.

```bash
npm run db:start     # prints the local URL and anon key
cp .env.example .env.local   # paste them in
npm run dev
npm run db:test      # tenant-isolation, permission and menu tests
npm run test:e2e     # browser tests against the local database
```
