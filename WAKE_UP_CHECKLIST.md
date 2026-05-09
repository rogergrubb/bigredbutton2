# Wake-up checklist for Roger

You went to sleep at v0.1. You're waking up at v0.8 — eight ships through the night.

Live: <https://bigredbutton.app>
App: <https://bigredbutton.app/app>
Showcase: <https://bigredbutton.app/showcase>
Manifesto: <https://bigredbutton.app/manifesto>
Source: <https://github.com/rogergrubb/bigredbutton2>
Health: <https://bigredbutton.app/api/health>

---

## What was built while you slept

### Backend (Vercel Edge Functions)

**`/api/agent`** — streaming Claude-with-tool-use loop. Tools:
- `plan` — Manus-style numbered plan emitted before any other work
- `generate_image` — Runway gen4_image_turbo
- `animate_image` — Runway gen3a_turbo (image → video)
- `speak` — ElevenLabs TTS in your cloned voice
- `write_html` — Lovable-style single-file vibe coding
- `write_text` — finalized text deliverables
- `read_url` — Cowork-style web scraping (fetches + strips + summarizes)
- `web_search` — Anthropic's server-side search with structured citations

**`/api/health`** — capability matrix endpoint (which keys are configured, which faculties are live)

**Skills** (server-side prompt expansion):
1. `build_landing` — Lovable-style HTML page
2. `research_brief` — Perplexity-style sourced one-pager
3. `competitor_scan` — top-5 comparison via web_search + write_html
4. `image_to_motion` — gen4 still chained to gen3a animation
5. `voice_clip` — Mini-Me reads any text aloud
6. `talking_head` — script + Mini-Me narration
7. `pitch_deck_html` — 6-slide single-file deck
8. `brand_kit` — logo concept + palette + fonts in one HTML page
9. `marketing_copy` — headlines + CTAs + 5 social posts
10. `cold_email` — 5-touch sequence

### Frontend (`/app`)

3-column responsive layout:
- **Left**: meet-Mini-Me video (your avatar.mp4) · status panel (live capability dots) · 10 skill buttons · artifact gallery (localStorage, 40-item buffer)
- **Center**: prompt textarea · big red button · streaming results · follow-up input · related-question chips
- **Right**: live agent stream · plan checklist with done states · Perplexity-style sources panel

Quality of life:
- Cmd/Ctrl+Enter to fire
- Reset button (clears state + gallery, with confirm)
- Help modal (one-line description of every faculty)
- Export button (downloads full conversation + gallery as JSON)
- Mobile responsive (stacks at 1100px, tightens at 600px)
- Smart Refine (auto-builds contextual prompt referencing the prior request)
- Markdown rendering for text outputs (marked@12 from CDN)
- Toast notifications
- Banner warns when Runway/EL keys are missing (dismissable)

### Static pages
- `/` — universal-positioning landing (was already there)
- `/showcase` — receipts grid (submission film, listing video, AI-Roger, hero stills, sample HTML, launch CTA)
- `/manifesto` — "tokens replace payroll" thesis with the BTOS 2026 stat
- `/404.html` — branded fallback (red 404 button → /app)
- `/robots.txt` + `/sitemap.xml` — SEO/discoverability
- `/examples/sample-landing.html` — proof-of-concept HTML output

### Repo housekeeping (done via API)
- ✅ Repo is **public** (was private — required for hackathon)
- ✅ Description set
- ✅ Homepage URL set to bigredbutton.app
- ✅ Topics added: runway, runway-api, runway-hackathon, autonomous-agent, claude-api, anthropic, elevenlabs, ai-agent, tool-use, vercel, edge-functions, solopreneur

---

## What needs YOU (in priority order)

### 1. Rotate the credentials I used (URGENT, ~3 minutes)

These were one-shot tokens you handed me. Treat them as compromised.

- **GitHub PAT**: <https://github.com/settings/tokens> → revoke `ghp_hMrK…`
- **Vercel token**: <https://vercel.com/account/tokens> → delete `vcp_6HnGH…`

### 2. Add the two missing API keys (so image/video/voice tools light up)

In Vercel: Project `bigredbutton2` → **Settings → Environment Variables → Add**. Apply to **Production, Preview, Development**.

| Key | Where to find it |
|---|---|
| `RUNWAY_API_KEY`    | <https://dev.runwayml.com/> → API keys |
| `ELEVENLABS_API_KEY`| <https://elevenlabs.io/app/profile> → API key |

After saving, click **Deployments → ⋯ → Redeploy** on the latest build.

Verify: <https://bigredbutton.app/api/health> — every capability dot should flip true.

### 3. Submit to the Runway hackathon (deadline Sun May 11, 9 am ET)

Form: <https://runwayml.com/api-hackathon>

Paste from `HACKATHON_SUBMISSION.md`:
- **Project name**: Big Red Button
- **Description**: the block under "## Description (paste verbatim)"
- **URL**: <https://bigredbutton.app>
- **GitHub**: <https://github.com/rogergrubb/bigredbutton2>
- **Demo video**: embedded at the URL; also `/demo.mp4`

### 4. Sanity test before submitting

Run this prompt at <https://bigredbutton.app/app>:

> Build a one-page landing page for a SaaS called Inboxer that turns email into structured tasks. Modern, dark-mode, minimalist.

Watch: stream → plan → write_html → finished page. If you see the page render in an iframe, it works.

(After Runway+EL keys are added, also try: "Generate a cinematic hero image of a coastal Florida luxury home at golden hour, then animate it for 5 seconds.")

### 5. Optional victory laps

- Tweet the URL with one of the receipts attached
- DM Cris on X with the manifesto link: `https://bigredbutton.app/manifesto`
- Pin the repo on your GitHub profile

— Mini-Me
