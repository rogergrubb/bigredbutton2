# v19 Hackathon Film — "Autonomous Momentum Capture"

**Title:** *The Big Red Button — An Autonomous AI Agent for Launching Media Products*
**Length:** 2:50–3:00
**Voice:** Roger Grubb cloned voice via ElevenLabs (voice_id NfHkocJCWwrSqAxfTcxk)
**Music bed:** ambient pad with subtle low-frequency pulse, atmospheric, calm but driving in middle acts
**Letterbox:** 2.35:1 cinematic crop
**Color grade:** dark, slightly desaturated, blue-gray base with warm amber accents

## Act-by-act build map

| Act | Time | Source | Voice line(s) |
|---|---|---|---|
| 1 — Founder chaos | 0:00–0:12 | Runway scene_01_founder_chaos animated | seg_01 |
| 1 — chaos cont. | 0:13–0:22 | screen recordings of bigredbutton.app, code editors, prototype apps cycling | seg_02 |
| 2 — Signal | 0:23–0:37 | YouTube Studio analytics screenshot animated (Ken Burns), Runway scene_02 | seg_03 |
| 3 — User need | 0:38–0:53 | Runway scene_03_sleep_gap animated, channel screencaps | seg_04, seg_05 |
| 3 — gap cont. | 0:54–1:09 | continued split-screen, real bedroom footage if available | seg_06, seg_07 |
| 3 — clarity | 1:10–1:38 | clean copy slate cards, fade between four phrases | seg_08 |
| 4 — Button | 1:40–1:50 | Runway scene_04_the_button animated press | seg_09 |
| 5 — Agent wakes | 1:51–2:07 | Runway scene_05_agent_wakes animated, BRB /app screen recording | seg_10, seg_11 |
| 6 — Runway showcase | 2:08–2:34 | Runway scene_06_brand_birth + scene_07_runway_wall, badge overlays for each endpoint | seg_12 |
| 7 — Reveal | 2:35–2:58 | Sleep Tech channel screencap, PROTOCOL 001 + queue, Runway scene_08_final_reveal | seg_13, seg_14 |
| Final | 2:59–3:05 | Big Red Button mark over dark background, end card | seg_15 |

## Real-footage assets (already in repo or capturable)
- `/avatar.mp4` — AI-Roger talking-head clip (use as cold open optional, or as the agent's "face" in act 5)
- YouTube Studio analytics screenshots Roger sent — embed as Ken Burns
- @TheCouncilOfFifty channel grid screenshot
- @SleepTechSuperChannel banner + PROTOCOL 001 thumbnail
- `bigredbutton.app/app` screen recording (live agent UI)

## Generation order (run on submission day)
1. Render all 15 voiceover segments via ElevenLabs (~5 min each, total ~10 min compute)
2. Submit all 8 Runway gen4_image jobs in parallel (~3 min each)
3. Once stills are back, submit gen3a_turbo motion jobs in parallel (~5 min each)
4. While Runway renders, prepare ffmpeg overlays, captions, music bed
5. Final ffmpeg assembly: voiceover audio bed + scene clips + screencaps + captions + letterbox + grade
6. Loudnorm to -14 LUFS for streaming standard
7. Output: `MOMENTUM_CAPTURE_v19.mp4`

## On-screen text overlays (cinematic, monospace, animated in/out)
- 0:05  "A solo founder."
- 0:14  "Too many ideas."
- 0:18  "No clear signal."
- 0:30  "Signal detected: faceless sleep content gaining velocity."
- 1:10  "Guided when needed."
- 1:18  "Black screen when useful."
- 1:25  "Cinematic when it matters."
- 1:32  "Built for repeat use."
- 1:55  "Signal → Strategy → Media → Launch"
- 2:18  "Runway API: text-to-video · image-to-video · video-to-video · text-to-speech · sound effects · multilingual dubbing · avatars · workflows"
- 2:48  "One signal. One button. One autonomous launch system."
- 3:00  "THE BIG RED BUTTON"
- 3:03  "Autonomous launch agent for solo founders"
- 3:05  "Demo: Sleep Technology Super Channel"
- 3:06  "Powered by Runway"
