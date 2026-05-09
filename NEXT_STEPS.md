# Next Steps — Getting TheBRB Live

The web app is built, typechecked, and the production build passes. Supabase backend is provisioned and seeded.

To finish v1, here's what's left, organized by what you need to do vs. what I can do for you in a follow-up session.

---

## 1. Set the Anthropic API key (REQUIRED, blocks everything)

**What to do:**
1. Go to https://console.anthropic.com/settings/keys
2. Click "Create Key" → name it `TheBRB-prod`
3. Copy the `sk-ant-...` value and paste it back to me — I'll add it to Vercel env when we deploy

This is the only key the server needs. Without it, `/api/chat` returns a 500.

---

## 2. Deploy to Vercel — choose one path

### Path A — I do it (faster)
Give me a Vercel deploy token:
1. Go to https://vercel.com/account/tokens
2. "Create Token" → name `thebrb-deploy`, scope `NumberOneSonSoftwareDevelopment`, no expiration
3. Paste it back to me

I'll then push the project to your Vercel team, wire up env vars (Supabase URL/key + your Anthropic key), and confirm deploy.

### Path B — You do it via dashboards (no tokens)
1. **Create the GitHub repo:**
   - Go to https://github.com/new
   - Name: `thebrb`
   - Visibility: **Private**
   - Skip README/license (we have one)
   - Click "Create repository"
   - On the next page, click "uploading an existing file"
   - Drag-and-drop **everything inside** the `thebrb/` folder (NOT the folder itself)
   - Commit message: "Initial commit"
   - Click "Commit changes"

2. **Connect Vercel:**
   - Go to https://vercel.com/new
   - Pick your team `NumberOneSonSoftwareDevelopment`
   - Click "Import" next to your new `thebrb` repo
   - Framework Preset: should auto-detect as Next.js — leave as is
   - Expand "Environment Variables" and add three:
     - `NEXT_PUBLIC_SUPABASE_URL` = `https://vskvejzvfdqxqionhfmk.supabase.co`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `sb_publishable_H5hE1BrawEoggM_eN9HOFg_PeRnb58I`
     - `ANTHROPIC_API_KEY` = your `sk-ant-...` from step 1
   - Click "Deploy"

After ~2 minutes, you'll get a `https://thebrb-<hash>.vercel.app` URL. Sign up, click a skill, watch it stream.

---

## 3. Configure Supabase auth providers

**Email/password** — works out of the box.

**Magic link** — works out of the box (uses Supabase's default email sender; switch to Resend later if you want branded emails).

**Google OAuth** — requires one-time setup:
1. Go to https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID → Web application
3. Authorized redirect URIs: `https://vskvejzvfdqxqionhfmk.supabase.co/auth/v1/callback`
4. Copy Client ID + Client Secret
5. In Supabase: https://supabase.com/dashboard/project/vskvejzvfdqxqionhfmk/auth/providers → Google → enable, paste credentials

If you skip Google for now, the email/password and magic link flows still work fine.

---

## 4. Mobile builds (Capacitor — iOS + Android)

The web app has a static-export config (`BUILD_TARGET=mobile npm run build` → `out/`).
`capacitor.config.ts` is in place with bundle ID `now.sellfast.thebrb`.

**Remaining:** Run Capacitor's "add platform" commands to scaffold native iOS + Android shells. These need a developer machine with Xcode (iOS) and Android Studio (Android). Once we have a deploy URL, I can guide you through the mobile shell config — it's a "next session" task because:
- Native shells are best generated and tested on a real Mac/PC with the platform SDKs installed
- TestFlight + Play Console submissions need your dev account credentials (we'll wire those when you're ready)

---

## 5. Desktop builds (Tauri — Windows + macOS)

`src-tauri/tauri.conf.json` is in place. Tauri 2 builds via GitHub Actions on push (no local Rust install required). Setting up the workflow is a "next session" task once the repo is on GitHub — I can write the `.github/workflows/release.yml` that builds signed `.dmg` and `.msi`/`.exe` artifacts on every tag.

---

## What I need from you to keep going (single batch)

1. Anthropic API key (`sk-ant-...`) — required for any chat to work
2. Either a Vercel deploy token (Path A) OR confirmation you'll do the GitHub upload yourself (Path B)
3. (Optional, for Google OAuth) Google OAuth credentials, or "skip Google for v1"

After deploy is confirmed, we'll do mobile + desktop in a follow-up session.
