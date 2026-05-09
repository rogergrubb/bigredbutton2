# Big Red Button — env vars to set in Vercel

The agent at `/app` won't be functional until these three env vars are set in the Vercel project. Set them in **Vercel dashboard ▸ Project ▸ Settings ▸ Environment Variables**, then redeploy (or trigger a new deploy from the Deployments tab).

## Required

| Name | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys |
| `RUNWAY_API_KEY`    | dev.runwayml.com → API keys |
| `ELEVENLABS_API_KEY`| elevenlabs.io → Profile ▸ API keys |

## Optional

| Name | Default |
|---|---|
| `ELEVENLABS_VOICE_ID` | `NfHkocJCWwrSqAxfTcxk` (Roger's cloned voice) |
| `ANTHROPIC_MODEL`     | `claude-sonnet-4-5` |

## Smoke test after setting keys

1. Open `https://<your-deployment>.vercel.app/app`
2. Paste a prompt (any preset chip works)
3. Press the button. Stream should fire within 1–3 seconds.

If you see "Server missing ANTHROPIC_API_KEY env var" → keys aren't loaded into the deployment yet. Re-deploy from Vercel after saving env vars.
