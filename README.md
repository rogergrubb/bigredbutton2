# TheBRB — The Big Red Button

A SellFast.Now real-estate AI assistant. One button. Next move handled.
Powered by Claude (Anthropic), Supabase auth + storage, deployed on Vercel.
Wraps to Windows, macOS, iOS, and Android via Tauri + Capacitor.

## Stack
- **Frontend**: Next.js 15 + React 19 + TypeScript + Tailwind 3
- **Backend**: Supabase (Postgres + Auth + RLS) — `thebrb` schema in `pi-lead-hub` project
- **AI**: Anthropic Claude Sonnet 4.6 (server-side proxy at `/api/chat`)
- **Mobile shell**: Capacitor 6 → iOS + Android
- **Desktop shell**: Tauri 2 → Windows + macOS

## v1 Skills (baked in)
1. Lead Qualifier — score motivation, pull next questions
2. Cold Call Script — opener + objection handlers
3. Contract Drafter — purchase agreement / assignment drafts
4. Follow-up Sequence — multi-day SMS+email cadence
5. Deal Analyzer — wholesale / flip / BRRRR math
6. Comp Analysis — ARV from pasted comps

## Run locally
1. Copy `.env.example` to `.env.local` and fill in values (Anthropic key required).
2. `npm install`
3. `npm run dev` → http://localhost:3000

## Deploy to Vercel
See `NEXT_STEPS.md` for the dashboard-only deployment path.

## Project structure
```
app/                     Next.js App Router pages
  api/chat/              Streaming Claude proxy
  api/conversations/     Conversation CRUD
  auth/callback/         OAuth callback handler
  chat/                  Main chat UI (auth-gated by middleware)
  login/, signup/        Auth pages
components/              React components (AuthForm, ChatShell)
lib/
  anthropic.ts           Anthropic SDK helper + model constant
  supabase/              Browser, server, middleware Supabase clients
middleware.ts            Session refresh + auth gating
capacitor.config.ts      Mobile wrapper config
src-tauri/               Desktop wrapper config
```

## Architecture notes
- The Anthropic API key NEVER leaves the server. All Claude calls go through `/api/chat`, which authenticates the Supabase session first.
- Conversations + messages are scoped to `auth.uid()` via RLS — a user cannot read or modify another user's data even with their JWT.
- `BUILD_TARGET=mobile npm run build` produces a static export in `out/` for Capacitor + Tauri to wrap.
