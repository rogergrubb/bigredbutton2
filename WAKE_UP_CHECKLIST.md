# Wake-up checklist for Roger

Live and ready: <https://bigredbutton.app/app>
Repo: <https://github.com/rogergrubb/bigredbutton2>

What's already done while you slept:
- ✅ Universal landing page deployed at `/`
- ✅ Live agent app deployed at `/app` (10 skills, plan tool, sources, gallery, voice, refine)
- ✅ Edge serverless function `/api/agent` streaming SSE
- ✅ `/api/health` endpoint reporting capability matrix
- ✅ Anthropic key was already set in Vercel — Mini-Me's brain is alive
- ✅ Realtor-branded Next.js skeleton replaced wholesale
- ✅ Five iterative ships: v0.1 → v0.4

What needs YOU (in priority order):

## 1. Rotate the credentials I used (URGENT, ~3 minutes)

These were one-shot tokens you handed me. Treat them as compromised by virtue of being pasted into a chat.

- **GitHub PAT**: <https://github.com/settings/tokens> → revoke `ghp_hMrK…` → create a new one if needed
- **Vercel token**: <https://vercel.com/account/tokens> → delete `vcp_6HnGH…`

## 2. Add the two missing API keys (so image/video/voice tools light up)

In Vercel: Project `bigredbutton2` → Settings → Environment Variables → Add. Apply to **Production, Preview, Development**.

| Key | Where to find it |
|---|---|
| `RUNWAY_API_KEY`    | <https://dev.runwayml.com/> → API keys |
| `ELEVENLABS_API_KEY`| <https://elevenlabs.io/app/profile> → API key |

After saving, click **Deployments → ⋯ → Redeploy** on the latest (v0.4) build to pick up the env vars.

Verify it worked: <https://bigredbutton.app/api/health> — every capability dot should flip green.

## 3. Submit to the Runway hackathon (deadline Sun May 11, 9 am ET)

URL: <https://runwayml.com/api-hackathon>

Paste these into the form:
- **Project name**: Big Red Button
- **Description**: copy from `HACKATHON_SUBMISSION.md` (block under "## Description (paste verbatim)")
- **URL**: <https://bigredbutton.app>
- **GitHub**: <https://github.com/rogergrubb/bigredbutton2>
- **Demo video**: embedded at the URL above; also `/demo.mp4`

## 4. Sanity-check before submitting

- Open <https://bigredbutton.app> — landing loads, demo video plays
- Open <https://bigredbutton.app/app> — Mini-Me intro shows, status panel shows green dots
- Press the button with: "Build a one-page landing page for a SaaS called Inboxer that turns email into structured tasks."
- Watch the agent stream a plan → emit HTML → finish

If everything's green, hit submit.

## 5. After-hours layering (when you have a minute)

- The repo is private — flip to public before submitting (Settings → Danger Zone) so judges/Cris can read the source
- Tweet the URL with one of the receipts attached
- DM Cris on X with the memo URL: `https://bigredbutton.app/#memo`

— Mini-Me
