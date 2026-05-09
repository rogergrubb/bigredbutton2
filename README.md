# Big Red Button

**One button. Whatever you ask for.**

The universal autonomous agent. State an outcome — build a website, compose a video, research a market, train a clone, automate a workflow — and the agent does the rest.

What [Cowork](https://www.anthropic.com) does for files. What [Manus](https://manus.im) does for tasks. What [Perplexity](https://perplexity.ai) does for research. What [Lovable](https://lovable.dev) does for code. All combined. No gates. Fully autonomous.

## What's in this repo

This repository hosts both the **public landing page** AND the **live agent app** at [bigredbutton.app](https://bigredbutton.app), submitted to the **Runway 2026 API Hackathon**.

| File | Purpose |
|---|---|
| `index.html` | Landing page — hero with embedded demo, superpower grid, outcome examples, workflow diagram, Runway endpoint stack, receipts, memo to Cris |
| `app.html` | **The live agent app** — single-page UI that streams Mini-Me's reasoning and renders deliverables (images, videos, voice, HTML) as they arrive |
| `api/agent.js` | Vercel Edge Function — Claude tool-use loop wired to Runway image+video, ElevenLabs voice, web search, HTML emit, text emit. Streams Server-Sent Events |
| `package.json` | Node engines declaration for Vercel |
| `vercel.json` | Caching, security headers, function maxDuration |
| `SETUP.md` | Env vars Roger must set in Vercel dashboard |
| `demo.mp4` | 60-second hackathon submission film (`MINIME_HACKATHON_DEMO_v18`) |
| `listing.mp4` | The real-estate listing video the agent generated end-to-end as the demo example |
| `avatar.mp4` | AI-Roger talking-head clip — Runway `avatars.create` + `gwm1_avatars` |
| `hero1.png`, `hero2.png` | `gen4_image_turbo` outputs from a brief |

## How it works

```
OUTCOME → MINI-ME → PLAN → APIS → EXECUTE → DELIVER
```

The user states what they want. Mini-Me plans. The plan calls APIs (Runway for video/voice, ElevenLabs for audio, web search for research, code execution for builds, file/desktop for orchestration). Output is delivered. The user only sees the button and the result.

## Stack — Runway endpoints used in the demo

| Endpoint | Role |
|---|---|
| `gen4_image_turbo` | Hero stills (Nano Banana Pro tier) — face-locked references |
| `gen4.5` | Image-to-video motion clips |
| `gen4_aleph` | Cinematic color grade pass |
| `avatars.create` | Persistent custom avatar (the user's clone) |
| `gwm1_avatars` | Audio-driven avatar talking-head video |
| `eleven_multilingual_v2` | Voice-over narration via cloned voice |
| `eleven_text_to_sound_v2` | Music bed and sound effects |
| `tasks API` | Submit / poll / retrieve orchestration spine |

Plus ElevenLabs Instant Voice Clone for the founder's voice.

## Demo example

The 60-second submission film shows the agent generating a finished real-estate listing video from a one-line brief. **That's one example** — picked for the hackathon because it's a non-trivial, multi-endpoint, end-to-end workflow with verifiable receipts.

The same agent also builds landing pages, researches markets, automates content pipelines, trains personal clones, and orchestrates MCP-style toolchains. Real-estate is the hackathon proof. Universal autonomy is the product.

## Deploy (Vercel — no terminal required)

1. Open [vercel.com/dashboard](https://vercel.com/dashboard)
2. **Add New ▸ Project ▸ Import Git Repository** (this repo)
3. Framework preset: **Other** · Output directory: `./`
4. Click **Deploy**
5. **Settings ▸ Domains ▸** assign `bigredbutton.app`

Done.

## Receipts

The agent's actual outputs from this hackathon week — embedded on the landing page and committed in this repo:

- 60-second submission film (`demo.mp4`)
- Real-estate listing video (`listing.mp4`)
- AI-Roger founder-clone talking head (`avatar.mp4`)
- 14 hero stills, 6 motion clips, 1 cinematic button render
- Voice clone, persistent avatar, full orchestration source code

Total Runway compute: **