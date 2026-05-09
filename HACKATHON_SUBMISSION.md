# Runway 2026 API Hackathon Submission

**Submission ready to paste into <https://runwayml.com/api-hackathon>.**

---

## Project name
**The Big Red Button** — Autonomous launch agent for solo founders

## One-line description
The Big Red Button watches what a solo founder is building, detects the traction signal, then uses Runway's API to turn that signal into a complete media product. Demo: it shipped Sleep Technology Super Channel.

## URL
<https://bigredbutton.app>

## GitHub
<https://github.com/rogergrubb/bigredbutton2> (public)

## Demo video
2–3 minute hackathon film embedded at the URL above.
Backup: `demo.mp4` in the repo root (earlier 60-second cut from the v18 build).

## Description (paste verbatim)

Solo founders don't need more ideas. They need to know what's already working — and when something works, they need to move before the moment disappears.

The Big Red Button is an autonomous launch agent for solo founders. It watches what you're building, detects the traction signal, then uses Runway's API to generate the brand, video assets, narration, multilingual variants, Shorts, thumbnails, and publishing plan needed to turn that signal into a real media product. We call it autonomous momentum capture.

**The submission demo is real.** On May 8, 2026, a faceless guided-meditation YouTube channel I'd made for myself — *The Council of Fifty* — started growing. 175 views in 48 hours. 9,240 impressions. 9.1 hours of watch time. **83.4% of views from "Suggested videos."** 32.2% retention on the welcome video. Two subscribers. No marketing. The algorithm noticed before I did.

So I pressed the Big Red Button. The agent read the signal, extracted the winning pattern from top sleep channels, built the positioning, authored the protocol architecture, and shipped *Sleep Technology Super Channel* — *"Engineered sleep for overactive minds."* PROTOCOL 001: Brown Noise Black Screen — 10 hours, deep sleep, sleep technology — is live now. PROTOCOL 002 (7-Minute Mental Shutdown + Rain) ships next. Each protocol = one button press. Each protocol uses the full Runway API surface end-to-end.

For each protocol video the agent orchestrates:
- **gen4_image / gen4_image_turbo** — cinematic sleep-world stills + thumbnail concepts
- **gen4.5 / gen3a_turbo** — image-to-video motion (slow ethereal drift, start+end frame transitions)
- **gen4_aleph** — atmospheric grade transforming raw visuals into premium sleep-lab cuts
- **avatars.create + gwm1_avatars** — persistent Mini-Me twin as the agent's face
- **eleven_multilingual_v2** — guided shutdown narration in the founder's cloned voice
- **eleven_text_to_sound_v2** — atmospheric pads, rain on glass, brown noise, low cinematic hits
- **voice dubbing** — multilingual variants (Japanese, Spanish, French, Portuguese, German)
- **voice isolation** — lift narrators from existing recordings without re-recording
- **tasks API** — orchestration spine: submit, poll, retrieve

The architecture: user states a signal → Big Red Button → Claude Dispatch (the brain) → Cowork (the executor) → Runway + ElevenLabs (the engine) → YouTube (the channel). One person operating at content-team scale.

Built solo. In one week. Total compute spend ~$233. Two real YouTube channels are part of this submission with real analytics anyone can verify.

This is what universal autonomy looks like in production: a profitable media channel running while the founder sleeps. The next million Runway customers don't need eight endpoints. They need one button.

## What the judges can do at the URL

- Watch the 2–3 minute demo film (judge-readable in <15 seconds)
- See the live YouTube channels — <https://www.youtube.com/@TheCouncilOfFifty> and <https://www.youtube.com/@SleepTechSuperChannel>
- Press the button at <https://bigredbutton.app/app> and watch the agent run
- See the analytics receipts on `/showcase`
- Read the memo to Cris on `/manifesto`
- Browse the public source

## Endpoints used (11 + tasks API)

1. `gen4_image` — text-to-image (prompt-only sleep visuals)
2. `gen4_image_turbo` — reference-guided iteration (Nano Banana Pro tier)
3. `gen4.5` — image-to-video motion
4. `gen4_aleph` — cinematic atmospheric grade
5. `gen3a_turbo` — image-to-video with start+end frame control
6. `avatars.create` — persistent custom avatar (Mini-Me)
7. `gwm1_avatars` — audio-driven talking-head video
8. `eleven_multilingual_v2` — guided narration in cloned voice
9. `eleven_text_to_sound_v2` — atmosphere, rain, brown noise, ambient pads
10. ElevenLabs voice dubbing — multilingual variants
11. ElevenLabs voice isolation — clean existing narration
+ `tasks API` — orchestration spine

## Tokens used during the hackathon week

- ~466 Runway credits ≈ $233 of compute produced everything you see
- ~7,000 ElevenLabs characters across voice clone, narration, music
- 91 videos shipped to *@TheCouncilOfFifty* in 5 languages overnight via Cowork
- 50+ drafts queued in *@SleepTechSuperChannel*
- Total session compute spend under $250 — by design

## Why this should win

The hackathon ask: "build a real creative system using Runway's API and show what it does fast."

This entry:
- **Is a real creative system in production**, with real YouTube analytics on May 8 climbing in real time
- **Solves the right problem** — the wiring gap between Runway's API surface and the next million customers (BTOS 2026: 32.5% AI use at 250+ employee firms vs. 17.3% at 5–9 employees)
- **Maps every Runway endpoint to a concrete content workflow** — not a vague "agent" but the actual pipeline that ships PROTOCOL N
- **Demonstrates the universal pattern** — same agent will ship the next channel, the next product, the next launch, every time the founder spots a signal
- **Built solo by exactly the customer profile Runway's Builders Program is targeting**

Solo founders don't need more ideas. They need a button.

— Roger Grubb · roger@grubb.net · numberoneson.us
