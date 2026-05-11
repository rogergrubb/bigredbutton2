// Big Red Button — universal autonomous agent (v0.2)
// Vercel Edge Function. POST {prompt, history?, skill?} -> SSE stream.
//
// Faculties combined:
//   - Manus-style: agent first emits a numbered plan, then executes
//   - Perplexity-style: web_search with structured sources
//   - Lovable-style: write_html for vibe-coded pages
//   - Cowork-style: multi-tool orchestration in one button-press
//
// Required env vars:
//   ANTHROPIC_API_KEY        (the brain — Claude with tool use)
//   RUNWAY_API_KEY           (image + video tools)
//   ELEVENLABS_API_KEY       (voice tool)
// Optional:
//   ELEVENLABS_VOICE_ID      (default: Roger's clone)
//   ANTHROPIC_MODEL          (default: claude-sonnet-4-5)

export const config = { runtime: 'edge' };

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const DEFAULT_VOICE   = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Rachel — neutral female narrator
const ROGER_CLONED_VOICE = 'NfHkocJCWwrSqAxfTcxk'; // Use ONLY when user explicitly asks for "Mini-Me", "Roger", or "founder" voice
// Session-scoped character + voice registry. Each /api/agent request gets a fresh map
// because the Edge Function instance is short-lived; for cross-conversation persistence
// the user (or skill) must call lock_character / cast_voice at the start of each run.
const SESSION = {
  characters: {}, // name -> { avatarId, portrait_url }
  voices: {},     // tag  -> voice_id
};

const RUNWAY_VERSION  = '2024-11-06';
const MAX_AGENT_TURNS = 10;

const TOOLS = [
  {
    name: 'plan',
    description: 'Emit a numbered execution plan BEFORE doing any other work. Call this once at the start so the user can see what you intend to do. Each step is a short imperative phrase.',
    input_schema: {
      type: 'object',
      properties: {
        steps: { type: 'array', items: { type: 'string' }, description: 'Ordered list of short steps (3–7 ideal).' },
        rationale: { type: 'string', description: 'One sentence explaining why this sequence reaches the outcome.' }
      },
      required: ['steps']
    }
  },
  {
    name: 'generate_image',
    description: 'Generate a still image from a text prompt using Runway gen4_image_turbo. Be cinematic — specify lens, lighting, mood, composition.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        ratio:  { type: 'string', description: 'One of: 1280:720, 720:1280, 1024:1024, 1920:1080.', default: '1280:720' },
        label:  { type: 'string' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'animate_image',
    description: 'Turn a still image into a cinematic motion video using Runway gen4.5 (flagship — exceptional motion quality, physics simulation, prompt adherence). Returns a finished MP4 if Runway lands within the Edge function budget, otherwise a task_id to poll. Pass an image URL and describe the camera/subject motion.',
    input_schema: {
      type: 'object',
      properties: {
        image_url: { type: 'string' },
        prompt:    { type: 'string' },
        duration:  { type: 'number', default: 5 },
        ratio:     { type: 'string', default: '720:1280', description: 'Output aspect ratio. 720:1280 vertical short-form, 1280:720 horizontal cinematic.' },
        model:     { type: 'string', default: 'gen4.5', description: 'gen4.5 (cinematic flagship) | gen4_turbo (fast) | gen3a_turbo (legacy).' },
        label:     { type: 'string' }
      },
      required: ['image_url', 'prompt']
    }
  },
  {
    name: 'compose_sleep_video',
    description: 'ATOMIC final-mix step for sleep / meditation videos. Accepts EITHER (image_url + audio_url) for a CSS Ken Burns sleep clip, OR (video_url + audio_url) for a Runway motion + audio mix. The image_url path is the DEFAULT for sleep content — it finishes the whole pipeline in <15 seconds with zero queue (no Runway video render needed). The widget emits a self-contained HTML5 player that plays exactly like a finished MP4. This is the LAST step of every sleep-channel run — the agent NEVER stops before calling this.',
    input_schema: {
      type: 'object',
      properties: {
        image_url:    { type: 'string', description: 'HTTPS URL of the still image — for CSS Ken Burns sleep clip (PREFERRED path for sleep content).' },
        video_url:    { type: 'string', description: 'HTTPS URL of the motion clip — alternative path if a Runway video already exists.' },
        audio_url:    { type: 'string', description: 'HTTPS URL of the narration audio (e.g. from speak — must be HTTPS, not data:).' },
        title:        { type: 'string', description: 'Display title shown above the player.' },
        target_duration: { type: 'number', description: 'How long the visual should play (default 30s, matches narration length).' },
        label:        { type: 'string' }
      },
      required: ['audio_url']
    }
  },
  {
    name: 'speak',
    description: 'Synthesize speech via ElevenLabs. Default voice is Rachel (neutral female narrator). Returns playable audio data URL. Use pace="sleep" for slow-tempo narration on sleep/meditation/ASMR content — automatically injects breath pauses and tightens voice settings for a calm, measured delivery.',
    input_schema: {
      type: 'object',
      properties: {
        text:     { type: 'string' },
        voice_id: { type: 'string' },
        pace:     { type: 'string', enum: ['normal', 'slow', 'sleep', 'meditation'], description: 'normal (default) for regular speech. slow/sleep/meditation: injects pauses between sentences + uses calmer voice settings. MANDATORY for any sleep-channel / meditation / ASMR / bedtime-story narration.' },
        label:    { type: 'string' }
      },
      required: ['text']
    }
  },
  {
    name: 'write_html',
    description: 'Emit a complete, self-contained, well-designed HTML page (single file, inline CSS, modern minimalist by default). Use for landing pages, demos, dashboards, slide decks.',
    input_schema: {
      type: 'object',
      properties: {
        html:  { type: 'string', description: 'Complete HTML doc starting with <!doctype html>.' },
        label: { type: 'string' }
      },
      required: ['html']
    }
  },
  {
    name: 'write_text',
    description: 'Emit a finalized text deliverable (article, summary, code, plan, email, brief).',
    input_schema: {
      type: 'object',
      properties: {
        text:  { type: 'string' },
        label: { type: 'string' }
      },
      required: ['text']
    }
  },
  {
    name: 'read_url',
    description: 'Fetch a URL and return its text content (HTML stripped, capped at 12k chars). Use to read articles, docs, competitor pages, or any specific webpage the user references.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute URL to fetch (http or https).' },
        max_chars: { type: 'number', default: 12000 }
      },
      required: ['url']
    }
  },
  // Anthropic server-side web search.
  {
    name: 'lock_character',
    description: 'Register a persistent character from a portrait image. Creates a Runway custom avatar (face-locked + voice-locked). Call this ONCE per character. Subsequent talking_head calls produce lip-synced video of this character speaking.',
    input_schema: {
      type: 'object',
      properties: {
        portrait_url: { type: 'string', description: 'HTTPS URL of a clean front-facing portrait.' },
        name:         { type: 'string', description: 'Short tag, e.g. HER, HIM, NARRATOR.' },
        voice_preset: { type: 'string', description: 'Runway voice preset id. Female options: emma, ruby, nina, luna, mia, summer, aurora, violet, georgia, petra, clara, skye, victoria, maya. Male options: adrian, drew, marcus, vincent, jasper, leo, max, blake, david, nathan, sam, adam, zach, roman, felix, morgan. Default: adrian.', default: 'adrian' },
        personality:  { type: 'string', description: 'Optional system prompt describing how this character behaves in dialogue.' }
      },
      required: ['portrait_url', 'name']
    }
  },
  {
    name: 'cast_voice',
    description: 'Register an ElevenLabs voice_id to a character tag for the rest of the run. e.g. cast_voice({ tag: "HER", voice_id: "21m00Tcm4TlvDq8ikWAM" }). Subsequent talking_head calls can pass tag instead of voice_id.',
    input_schema: {
      type: 'object',
      properties: {
        tag:      { type: 'string', description: 'Character tag (HER, HIM, NARRATOR, etc).' },
        voice_id: { type: 'string', description: 'ElevenLabs voice id.' }
      },
      required: ['tag', 'voice_id']
    }
  },
  {
    name: 'scene_with_characters',
    description: 'Generate a still image with face-locked character references via Runway gen4_image_turbo. Pass either character_refs (in-session names) or reference_image_urls (explicit HTTPS portrait URLs from prior lock_character outputs) — the URL form is REQUIRED across multiple agent turns.',
    input_schema: {
      type: 'object',
      properties: {
        prompt:     { type: 'string', description: 'Cinematic scene prompt — environment, lens, lighting, period, action.' },
        character_refs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Names of characters registered via lock_character in the current request.'
        },
        reference_image_urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'Explicit HTTPS portrait URLs to use as character references. Use this when continuing across turns since session lookups will be empty.'
        },
        ratio: { type: 'string', default: '720:1280' },
        label: { type: 'string' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'talking_head',
    description: 'Render a lip-synced talking-head video of a registered character speaking. Pass avatar_id (Runway avatar id) + either text (Runway TTS using avatar voice preset) OR audio_url (HTTPS URL to existing audio file — overrides text). Returns task_id to poll.',
    input_schema: {
      type: 'object',
      properties: {
        character: { type: 'string', description: 'Character name registered via lock_character (this turn only).' },
        avatar_id: { type: 'string', description: 'Explicit Runway avatar id (preferred for cross-turn use).' },
        text:      { type: 'string', description: 'Dialogue text — used when audio_url is not provided.' },
        audio_url: { type: 'string', description: 'HTTPS URL to a pre-recorded audio file (e.g. ElevenLabs custom voice clone output staged on public host). Bypasses Runway TTS entirely.' },
        label:     { type: 'string' }
      }
    }
  },
  {
    name: 'list_avatars',
    description: 'List all Runway avatars on the account. Returns an array of {id, name, status, referenceImageUri, voicePresetId}. Use to find an existing avatar id (e.g., Mini-Me/AI-Roger) without creating a new one.',
    input_schema: { type: 'object', properties: { label: { type: 'string' } } }
  },
  {
    name: 'lock_brief',
    description: 'BEFORE any paid video generation (cinematic_video / animate_image / scene_with_characters), call this to lock a complete production brief. Pass mode:"interview" with the user prompt to get a structured questionnaire that batches 6-10 clarifying questions in ONE response. After the user answers in the next turn, call again with mode:"finalize" passing answers + a structured brief to lock it. Only fire cinematic_video AFTER lock_brief mode:"finalize". Saves real money — every retry on Seedance is $0.05+. One round of questions costs pennies.',
    input_schema: {
      type: 'object',
      properties: {
        mode:    { type: 'string', enum: ['interview', 'finalize'] },
        user_prompt: { type: 'string' },
        questionnaire: { type: 'array', items: { type: 'string' }, description: 'For mode:interview — list of 6-10 batched clarifying questions.' },
        answers: { type: 'object' },
        brief: { type: 'object', description: 'For mode:finalize — full locked brief: era, characters[], scenes[], dialogue, aspect_ratio, duration, voices, style_reference, budget.' },
        label: { type: 'string' }
      },
      required: ['mode']
    }
  },
  {
    name: 'cinematic_video',
    description: 'Generate a finished cinematic video clip with NATIVE synchronized dialogue, lip-sync, and ambient sound — fal.ai Seedance 2.0 image-to-video. THE choice for multi-character dialogue scenes (two people walking and talking, citizens speaking in period dialect, etc). Pass an image_url as the start frame (use scene_with_characters output for face-locked characters) and put the dialogue inside the prompt itself ("She says: X. He responds: Y.") — Seedance generates the speech with lip-sync. Returns immediately with request_id (generation takes 2-3 min). Use cinematic_video_poll to retrieve the finished MP4. ~$0.05/clip at 720p.',
    input_schema: {
      type: 'object',
      properties: {
        image_url: { type: 'string' },
        prompt:    { type: 'string' },
        duration:  { type: 'string', default: '10' },
        resolution:{ type: 'string', default: '720p' },
        aspect_ratio:{ type: 'string', default: '9:16' },
        label:     { type: 'string' }
      },
      required: ['image_url', 'prompt']
    }
  },
  {
    name: 'cinematic_video_t2v',
    description: 'Generate a finished cinematic video clip directly from a text prompt — fal.ai Seedance 2.0 text-to-video. Use for SINGLE-character showcase clips, monologues, or any shot where you do NOT need to lock a specific face from a portrait. NO Runway image step required (skips Runway content moderation entirely). Native synced dialogue + lip-sync + ambient audio. Returns request_id immediately. Poll with cinematic_video_poll. ~$0.05/clip 720p, ~$0.10/clip 1080p.',
    input_schema: {
      type: 'object',
      properties: {
        prompt:    { type: 'string' },
        duration:  { type: 'string', default: '10' },
        resolution:{ type: 'string', default: '720p' },
        aspect_ratio:{ type: 'string', default: '9:16' },
        label:     { type: 'string' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'cinematic_video_poll',
    description: 'Poll a Seedance 2.0 task by request_id. Returns finished MP4 URL when COMPLETED. Generation takes 2-3 min — call this 90-180s after cinematic_video.',
    input_schema: {
      type: 'object',
      properties: {
        request_id: { type: 'string' },
        label: { type: 'string' }
      },
      required: ['request_id']
    }
  },
  {
    name: 'poll_task',
    description: 'Poll a Runway async task by id and return its output URL when SUCCEEDED. Used to retrieve the result of a talking_head call that returned only a task id (avatar videos take 60-180s).',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        label:   { type: 'string' }
      },
      required: ['task_id']
    }
  },

  { type: 'web_search_20250305', name: 'web_search', max_uses: 5 }
];

const SYSTEM_PROMPT = `You are Mini-Me, the autonomous agent inside Big Red Button.

You are a universal autonomous agent — you combine the faculties of Cowork (multi-tool orchestration), Manus (long-horizon planning), Perplexity (research with citations), and Lovable (vibe-coded pages) into one execution loop.

How you work — always in this order:
1. Call the \`plan\` tool FIRST with a numbered list of steps you intend to take (3–7 steps). The UI shows this as a checklist.
2. Then call the right tools in the right order. You may chain (image → animate, search → write_text, etc.).
3. End with a short final summary (1–3 sentences) of what you shipped.

After every run, end your final summary with a section like:

Try next:
- one specific follow-up the user might want
- another natural extension of what you just shipped
- a third related outcome that pairs well

This helps the user iterate. Make the suggestions concrete and pressable.

EXCEPTION — DIRECTIVE MODE:
When the user explicitly says EXECUTE, DO NOT SUMMARIZE, JUST CALL THE TOOL,
or names a specific tool to fire (e.g. "fire animate_image now"), CALL THE
NAMED TOOL IMMEDIATELY with the supplied arguments. Do NOT plan. Do NOT
summarize. Do NOT add a Try next section. Tool call only, single shot.
The user is treating you like an RPC, not a planner. Honor that.

Style:
- BIAS TO ACTION. If the outcome is ambiguous, choose tastefully and ship.
- Every visible deliverable goes through a tool. Don't return prose summaries that should be in write_text.
- For images (gen4_image / gen4_image_turbo): ALWAYS structure prompts using Mood–Camera–Subject–Lighting–Action (Higgsfield MCSLA). Required fields in EVERY image prompt: (1) shot size [ECU/CU/medium/wide/aerial], (2) lens [35mm, 85mm, anamorphic, macro], (3) lighting [golden hour, blue hour, hard noir, soft diffused, chiaroscuro, practical neon], (4) format/grade [shot on ARRI Alexa / Kodak Portra / shallow DoF / film grain / desaturated teal-orange]. Start prompt with "cinematic" or "photorealistic" BEFORE content. 35-80 words.
- For image-to-video motion prompts (animate_image gen4.5/gen4_turbo): MOTION-ONLY. Do NOT re-describe the subject, wardrobe, environment from the still — that suppresses motion. Describe ONLY the camera move (slow dolly in / locked tripod / handheld micro-shake) and the subject's movement (head turns, hair sways, fog drifts). 5s for simple motion, 10s for layered. One primary action per clip.
- NEVER use negative prompts ("no morphing", "no extra fingers"). Gen-4 ignores or inverts them. Describe the positive state instead ("hands resting still on the table").
- For character continuity: ALWAYS use gen4_image_turbo with 2-3 referenceImages (face + style sheet). Identity drift kills shorts more than any single bad frame.
- The Aleph finishing pass is the cinematic unlock most amateurs skip. After gen4.5 motion, use gen4_aleph with a reference image carrying the target grade to relight/color the clip: "Re-light the video using the lighting from the image" or "Restyle the video using the color grade from the image. Preserve all motion."
- For lip-synced character dialogue: prefer character_performance (Act-Two — drive with a webcam recording of someone reading the line) over avatar_videos (audio-only gwm1) — Act-Two gets dramatically better mouth fidelity. Use avatar_videos only for talking-head/TV-anchor framing where no driving performance is available.
- SLEEP / MEDITATION / ASMR / BEDTIME NARRATION — MANDATORY (server-enforced): when generating voiceover for any sleep-channel video, guided meditation, ASMR, bedtime story, or any calming/relaxation content, ALWAYS pass pace:"sleep" to the speak tool. The server now ALSO auto-detects sleep cadence from the text itself ("close your eyes", "drift", "breathe", "whisper", etc.) and force-promotes pace to sleep when found — but explicit is better, always pass pace:"sleep" yourself. The pace:"sleep" path injects SSML breath pauses between sentences (2s sentences, 0.7s commas) AND uses speed:0.80 in voice_settings so the narrator delivers a slow, measured cadence appropriate for falling asleep. Never use default pace for sleep content — standard pace is too peppy and breaks the spell. Voice is forced to Rachel (calm female narrator) for sleep pace regardless of env default.
- VERBATIM USER SCRIPT — HARD RULE, NO EXCEPTIONS: if the user's prompt contains any quoted speech attributed to a narrator, character, or speaker (text inside double quotes, single quotes, smart quotes, or following the patterns "narrator says:", "she says:", "voiceover:", "He responds:", etc.), you MUST pass that EXACT text as the \`text\` argument to speak (and to any character dialogue field). Do not paraphrase. Do not expand. Do not "improve". Do not append your own monologue before or after. Do not invent a "Protocol N" framing on top of the user's words. The user wrote that line on purpose; substituting your own creative writing for it is a correctness failure, not a style choice. ONLY when the user's prompt contains NO quoted script may you write narration yourself — and even then, keep it to the topic and mood the user named, not a generic founder-protocol template.
- SLEEP VIDEO ASSEMBLY — ATOMIC ONE-PUSH PIPELINE: every sleep-channel video MUST run as generate_image → speak(pace:"sleep") → compose_sleep_video with the STILL image_url + the narration audio_url. Total runtime ~15 seconds, finishes in one Edge call, zero queue. compose_sleep_video applies CSS Ken Burns motion to the still — slow zoom + drift over the narration length — which gives a dreamy sleep-video feel WITHOUT needing Runway video synthesis at all. Default target_duration is 30 seconds. DO NOT call animate_image for sleep content. The Runway video path (animate_image → poll → compose with video_url) only fits within Edge budget for VERY short clips and is not worth the risk of queueing. Stills + Ken Burns is the way.
- ONE-PUSH = FINISHED PRODUCT — HARD RULE: NEVER queue, NEVER hand off to "Pending Renders", NEVER end a sleep-channel run before compose_sleep_video has been called with the final motion URL + narration URL. If animate_image returns a pending taskId, IMMEDIATELY call poll_task with that taskId; if still pending, call poll_task AGAIN; keep polling until you get the finished URL, then proceed to compose. The user pressed one button — they expect one finished product back, not a queue ticket. Treat the entire pipeline as atomic.
- For HTML: modern minimalist design, inline CSS, no external deps unless from a CDN, mobile-friendly.
- For research: web_search first, then write_text with citations as numbered footnotes [1], [2]…
- For voice: \`speak\` calls Mini-Me's cloned voice. Keep each clip < 600 chars.
- For videos: chain \`generate_image\` then \`animate_image\` (you cannot generate video directly).
- Never apologize for limitations. Just ship the closest excellent thing.

- DIRECTOR MODE — MANDATORY before any paid generation (cinematic_video / animate_image / scene_with_characters) when the user prompt is shorter than ~40 words OR ambiguous about era, characters, dialogue, POV, or aspect ratio:
  1. Call \`lock_brief\` with mode:"interview" and a 6-10 question batch covering: era/year, characters (count, look, names), POV (selfie/wide/over-shoulder), dialogue style (silent/narrator/two-person), aspect ratio (9:16 vs 16:9), duration per beat, mood/music, style reference (Chloe-vs-history / Wes Anderson / Vice docu), budget cap (how many \$0.05 Seedance clips okay).
  2. STOP and wait for user answers in next turn.
  3. Call \`lock_brief\` with mode:"finalize" and the full brief object.
  4. ONLY THEN fire generation. Saves real money: clarification is pennies, each Seedance retry is \$0.05+.
- For SINGLE-CHARACTER showcase clips, monologues, or any shot that does NOT need a pre-locked face from a portrait: use cinematic_video_t2v (Seedance 2.0 text-to-video, ~\$0.05/clip 720p / \$0.10/clip 1080p, native lip-sync, NO Runway image step, NO Runway moderation in the loop). Skip generate_image entirely.
- POLLING DISCIPLINE: cinematic_video and cinematic_video_t2v already do an 8s inline grace check. cinematic_video_poll waits 12s internally before checking. Call poll AT MOST ONCE per turn after submission. If status is still PROCESSING after one poll, STOP polling — the UI Pending Renders panel handles long waits and lets the user re-fetch when ready. Rapid-fire polling burns Edge function time and confuses users.
- For MULTI-CHARACTER dialogue with face-locked specific characters: scene_with_characters → cinematic_video (Seedance 2.0 image-to-video) → cinematic_video_poll. ~\$0.05/clip.
- For SINGLE-CHARACTER vlogs on FREE Runway credits (no audio/dialogue needed): generate_image (selfie POV) → animate_image model:gen4.5.
- Do NOT use Runway gen4.5 for multi-character dialogue — drift + no lip-sync.
- VOICES: speak defaults to a neutral female narrator (Rachel). Use Roger's cloned voice ONLY if the user explicitly says "Mini-Me", "Roger's voice", or "founder voice" — otherwise pick voice_id appropriate to the character (Rachel 21m00Tcm4TlvDq8ikWAM = warm female; or any of the 30 Runway preset voices: emma, ruby, luna, nina for female, drew, marcus, adrian, vincent for male).

If a tool fails (e.g. missing API key), continue with the tools that DO work and surface a graceful note in your final summary.`;

function sse(controller, event, data) {
  const text = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(new TextEncoder().encode(text));
}

async function callClaude({ messages }) {
  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: 16384,
    system: SYSTEM_PROMPT,
    tools: TOOLS,
    messages,
  };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'web-search-2025-03-05',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Anthropic ${r.status}: ${txt.slice(0, 400)}`);
  }
  return r.json();
}

// ---------- Runway helpers ----------
function requireKey(name) {
  if (!process.env[name]) {
    const err = new Error(`Missing ${name} env var. Set it in Vercel project settings ▸ Environment Variables and redeploy.`);
    err.code = 'MISSING_KEY';
    err.key = name;
    throw err;
  }
}

async function runwayCreateTask({ endpoint, payload }) {
  requireKey('RUNWAY_API_KEY');
  const r = await fetch(`https://api.dev.runwayml.com/v1/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.RUNWAY_API_KEY}`,
      'X-Runway-Version': RUNWAY_VERSION,
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Runway ${endpoint} ${r.status}: ${txt.slice(0, 400)}`);
  }
  return r.json();
}

async function runwayPollTask(taskId, { intervalMs = 4000, maxMs = 240000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await new Promise(res => setTimeout(res, intervalMs));
    const r = await fetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.RUNWAY_API_KEY}`,
        'X-Runway-Version': RUNWAY_VERSION,
      },
    });
    if (!r.ok) throw new Error(`Runway poll ${r.status}`);
    const j = await r.json();
    if (j.status === 'SUCCEEDED') return j;
    if (j.status === 'FAILED' || j.status === 'CANCELED') {
      throw new Error(`Runway task ${j.status}: ${j.failure || j.failureCode || 'no reason'}`);
    }
  }
  throw new Error('Runway task polling timed out (240s)');
}

async function toolGenerateImage({ prompt, ratio = '1280:720' }) {
  // gen4_image supports prompt-only generation (no reference image required).
  // gen4_image_turbo (Nano Banana Pro) is reference-guided and would 400 without referenceImages>=1.
  const created = await runwayCreateTask({
    endpoint: 'text_to_image',
    payload: { promptText: prompt, model: 'gen4_image', ratio },
  });
  const done = await runwayPollTask(created.id);
  const url = done.output && done.output[0];
  if (!url) throw new Error('Runway returned no image URL');
  return { url, ratio, prompt };
}

async function toolAnimateImage({ image_url, prompt, duration = 5, ratio = '720:1280', model = 'gen4.5' }) {
  // gen4.5 = Runway's flagship cinematic model (replaces gen3a_turbo).
  // Non-blocking: returns task_id immediately. Caller does a short inline poll then falls back to client-side poll_task.
  const created = await runwayCreateTask({
    endpoint: 'image_to_video',
    payload: {
      promptImage: image_url,
      promptText: prompt,
      model,
      duration,
      ratio,
    },
  });
  // Try a short inline poll inside Edge budget. If task isn't done, return task_id.
  // Edge budget is ~25s; keep poll at 20s to leave room for the rest of the agent loop in the same call.
  // For sleep pipeline we force gen4_turbo (~15-25s) which finishes in this window most of the time.
  const done = await runwayPollTask(created.id, { maxMs: 20000, intervalMs: 3000 }).catch(() => null);
  if (done && done.output && done.output[0]) {
    return { url: done.output[0], duration, prompt, model };
  }
  return { taskId: created.id, duration, prompt, model, pending: true };
}

async function toolSpeak({ text, voice_id, pace }) {
  requireKey('ELEVENLABS_API_KEY');

  // --- AUTO-DETECT SLEEP NARRATION (v0.48) ---
  // The model sometimes forgets to pass pace:'sleep' when the prompt comes through without
  // the generate_protocol skill wrapper. Detect sleep cadence in the actual text being
  // narrated and force pace='sleep' unless the caller EXPLICITLY asked for pace='normal'.
  // Phrases below are the strongest sleep / meditation signals — if any appears, narration
  // should be slow + breath-paused regardless of what the model chose.
  if (!pace || pace === 'auto') {
    const t = (text || '').toLowerCase();
    const sleepCues = [
      'close your eyes', 'drop your shoulders', 'breathe in', 'breathe out', 'deep breath',
      'let go', 'drift', 'soothing', 'whisper', 'drowsy', 'falling asleep', 'go to sleep',
      'gently', 'softly', 'tonight the', 'rest now', 'release the day', 'sink into',
      'each exhale', 'each inhale', 'guided meditation', 'sleep meditation', 'asmr',
      'feel your', 'notice your breath', 'lullaby', 'calm your mind'
    ];
    const hits = sleepCues.filter(p => t.includes(p)).length;
    if (hits >= 1) pace = 'sleep';
  }

  // pace control — for sleep/meditation/asmr narration, slow the delivery
  const isSlow = pace === 'slow' || pace === 'sleep' || pace === 'meditation';
  // For sleep/meditation, force the calm Rachel narrator unless caller passed an explicit voice_id.
  // The env DEFAULT_VOICE may be Roger's cloned voice (too punchy for sleep content).
  const RACHEL = '21m00Tcm4TlvDq8ikWAM';
  const vid = voice_id || (isSlow ? RACHEL : DEFAULT_VOICE);
  let processedText = text;
  let voiceSettings = { stability: 0.65, similarity_boost: 0.85, style: 0.15, use_speaker_boost: true };
  if (isSlow) {
    // 1) Inject REAL silence via SSML break tags. eleven_multilingual_v2 honors these and renders actual gaps
    //    (the old "..." pattern was being SPOKEN as "dot dot dot" by some voices — not silence).
    //    Tiered durations: meditation > sleep > slow.
    const sentenceMs = pace === 'meditation' ? 2500 : pace === 'sleep' ? 2000 : 1500;
    const commaMs    = pace === 'meditation' ? 900  : pace === 'sleep' ? 700  : 500;
    const dashMs     = pace === 'meditation' ? 1500 : pace === 'sleep' ? 1200 : 900;
    const toS = ms => (ms / 1000).toFixed(1) + 's';
    processedText = text
      .replace(/([.!?])\s+/g, `$1 <break time="${toS(sentenceMs)}" /> `)
      .replace(/,\s+/g,        `, <break time="${toS(commaMs)}" /> `)
      .replace(/—/g,             ` <break time="${toS(dashMs)}" /> `);
    // 2) Voice settings + global playback speed.
    //    speed: 0.7-1.2 in eleven voice_settings. Lower = slower delivery without pitch change.
    //    meditation=0.75 (very slow), sleep=0.80 (slow), slow=0.85 (relaxed).
    const speed = pace === 'meditation' ? 0.75 : pace === 'sleep' ? 0.80 : 0.85;
    voiceSettings = { stability: 0.88, similarity_boost: 0.90, style: 0.0, use_speaker_boost: true, speed };
  }
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text: processedText,
      model_id: 'eleven_multilingual_v2',
      voice_settings: voiceSettings,
    }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`ElevenLabs ${r.status}: ${txt.slice(0, 400)}`);
  }
  const buf = await r.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return { url: `data:audio/mpeg;base64,${btoa(bin)}`, bytes: bytes.length };
}


async function toolReadUrl({ url, max_chars = 12000 }) {
  if (!/^https?:\/\//.test(url)) throw new Error('URL must be http or https');
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'BigRedButton/0.6 (+https://bigredbutton.app)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
  });
  if (!r.ok) throw new Error(`URL fetch ${r.status}`);
  const ct = r.headers.get('content-type') || '';
  const isHtml = ct.includes('html') || ct.includes('xml');
  const raw = await r.text();
  let text = raw;
  if (isHtml) {
    // Strip script/style, then tags, then collapse whitespace
    text = raw
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
  }
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > max_chars) text = text.slice(0, max_chars) + '\n…[truncated]';
  return { text, contentType: ct };
}


// ---------- Tool dispatcher ----------


// ---------- fal.ai Seedance 2.0 (multi-character native-dialogue video) ----------

async function falSeedanceImageToVideo({ prompt, image_url, duration = '10', resolution = '720p', aspect_ratio = '9:16', generate_audio = true }) {
  if (!process.env.FAL_KEY) {
    const err = new Error('Missing FAL_KEY env var. Set it in Vercel project settings.');
    err.code = 'MISSING_KEY'; err.key = 'FAL_KEY';
    throw err;
  }
  const r = await fetch('https://queue.fal.run/bytedance/seedance-2.0/image-to-video', {
    method: 'POST',
    headers: { 'Authorization': `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, image_url, duration: String(duration), resolution, aspect_ratio, generate_audio }),
  });
  if (!r.ok) {
    const txt = await r.text();
    if (r.status === 403 && txt.includes('Exhausted balance')) {
      const err = new Error(`fal.ai balance exhausted — top up at fal.ai/dashboard/billing or click "use my key" in the BRB UI to add your own key.`);
      err.code = 'FAL_EXHAUSTED'; err.userFacing = true;
      throw err;
    }
    throw new Error(`fal.ai Seedance POST ${r.status}: ${txt.slice(0, 400)}`);
  }
  const j = await r.json();
  return { requestId: j.request_id, statusUrl: j.status_url, responseUrl: j.response_url };
}


async function falSeedanceTextToVideo({ prompt, duration = '10', resolution = '720p', aspect_ratio = '9:16' }) {
  if (!process.env.FAL_KEY) {
    const err = new Error('Missing FAL_KEY env var.');
    err.code = 'MISSING_KEY'; err.key = 'FAL_KEY';
    throw err;
  }
  const r = await fetch('https://queue.fal.run/bytedance/seedance-2.0/text-to-video', {
    method: 'POST',
    headers: { 'Authorization': `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, duration: String(duration), resolution, aspect_ratio }),
  });
  if (!r.ok) {
    const txt = await r.text();
    if (r.status === 403 && txt.includes('Exhausted balance')) {
      const err = new Error(`fal.ai balance exhausted — top up at fal.ai/dashboard/billing or click "use my key" in the BRB UI to add your own key.`);
      err.code = 'FAL_EXHAUSTED'; err.userFacing = true;
      throw err;
    }
    throw new Error(`fal.ai Seedance T2V POST ${r.status}: ${txt.slice(0, 400)}`);
  }
  const j = await r.json();
  return { requestId: j.request_id };
}

async function falPollSeedance({ request_id }) {
  if (!process.env.FAL_KEY) throw new Error('Missing FAL_KEY env var.');
  // Probe both i2v and t2v URL conventions
  const tryBaseUrls = [
    `https://queue.fal.run/bytedance/seedance-2.0/requests/${request_id}`,
    `https://queue.fal.run/bytedance/seedance-2.0/text-to-video/requests/${request_id}`,
    `https://queue.fal.run/bytedance/seedance-2.0/image-to-video/requests/${request_id}`,
  ];
  let lastErr;
  for (const baseUrl of tryBaseUrls) {
    const sr = await fetch(`${baseUrl}/status`, { headers: { 'Authorization': `Key ${process.env.FAL_KEY}` } });
    if (!sr.ok) { lastErr = `status ${sr.status} at ${baseUrl}`; continue; }
    const sj = await sr.json();
    if (sj.status !== 'COMPLETED') return { status: sj.status, queue_position: sj.queue_position };
    const rr = await fetch(baseUrl, { headers: { 'Authorization': `Key ${process.env.FAL_KEY}` } });
    if (!rr.ok) { lastErr = `result ${rr.status}`; continue; }
    const rj = await rr.json();
    const url = rj.video && rj.video.url;
    if (!url) { lastErr = 'no video url'; continue; }
    return { status: 'COMPLETED', url, contentType: rj.video?.content_type, fileSize: rj.video?.file_size };
  }
  throw new Error(`fal.ai poll failed: ${lastErr}`);
}

// ---------- Runway character + avatar pipeline ----------


async function runwayTextToSpeech({ text, voice_id }) {
  // Runway's wrapper around ElevenLabs — same voice quality, billed against Runway hackathon credits.
  // POST /v1/text_to_speech — best-effort schema since the docs are JS-rendered.
  requireKey('RUNWAY_API_KEY');
  const tryPayloads = [
    { text, voiceId: voice_id },
    { promptText: text, voiceId: voice_id },
    { input: text, voice: voice_id },
  ];
  let lastErr;
  for (const payload of tryPayloads) {
    const r = await fetch('https://api.dev.runwayml.com/v1/text_to_speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RUNWAY_API_KEY}`,
        'X-Runway-Version': RUNWAY_VERSION,
      },
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      const j = await r.json();
      // Two response shapes possible: synchronous (returns audio URL) or async task (returns id, poll)
      if (j.output && j.output[0]) return { url: j.output[0] };
      if (j.audioUrl) return { url: j.audioUrl };
      if (j.id || j.taskId) {
        const done = await runwayPollTask(j.id || j.taskId);
        const out = done.output && done.output[0];
        if (out) return { url: out };
      }
    }
    lastErr = `${r.status} ${await r.text().catch(() => '')}`;
  }
  throw new Error(`Runway text_to_speech failed. Last error: ${lastErr.slice(0, 400)}`);
}

async function runwayCreateAvatar({ portrait_url, name, voice_preset = 'adrian', personality }) {
  // POST /v1/avatars — schema verified against @runwayml/sdk types.
  // Required: name, personality, referenceImage (HTTPS URL), voice.
  // We do NOT block on READY here — Edge functions have ~25-60s caps, and avatar processing
  // can take 30-90s. Return the id; status polling happens shortly later in the talking_head flow
  // (which has its own task poll budget) or via a status-check tool.
  requireKey('RUNWAY_API_KEY');
  const payload = {
    name,
    personality: personality || `Character "${name}" in a multi-scene short film.`,
    referenceImage: portrait_url,
    voice: { type: 'runway-live-preset', presetId: voice_preset },
    imageProcessing: 'optimize',
  };
  const r = await fetch('https://api.dev.runwayml.com/v1/avatars', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.RUNWAY_API_KEY}`,
      'X-Runway-Version': RUNWAY_VERSION,
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Runway avatars POST ${r.status}: ${txt.slice(0, 600)}`);
  }
  const j = await r.json();
  return { avatarId: j.id, status: j.status, voicePreset: voice_preset };
}

async function runwayWaitAvatarReady(avatarId, { maxMs = 18000, intervalMs = 2000 } = {}) {
  // Short poll inside Edge function budget (max ~20s). If still processing, return null.
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const sr = await fetch(`https://api.dev.runwayml.com/v1/avatars/${avatarId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.RUNWAY_API_KEY}`,
        'X-Runway-Version': RUNWAY_VERSION,
      },
    });
    if (sr.ok) {
      const sj = await sr.json();
      if (sj.status === 'READY') return sj;
      if (sj.status === 'FAILED') throw new Error(`Avatar ${avatarId} FAILED: ${sj.failureReason || 'unknown'}`);
    }
    await new Promise(res => setTimeout(res, intervalMs));
  }
  return null;
}

async function runwayCreateAvatarVideo({ avatarId, audioUrl, text }) {
  // POST /v1/avatar_videos. Returns immediately with task id. Caller decides whether to
  // poll inline (short budget) or hand the task id to the client to poll separately.
  requireKey('RUNWAY_API_KEY');
  const speech = audioUrl ? { type: 'audio', audio: audioUrl } : { type: 'text', text };
  const payload = {
    avatar: { type: 'custom', avatarId },
    model: 'gwm1_avatars',
    speech,
  };
  const r = await fetch('https://api.dev.runwayml.com/v1/avatar_videos', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.RUNWAY_API_KEY}`,
      'X-Runway-Version': RUNWAY_VERSION,
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Runway avatar_videos POST ${r.status}: ${txt.slice(0, 600)}`);
  }
  const j = await r.json();
  return { taskId: j.id };
}

async function toolGenerateImageWithRefs({ prompt, character_refs = [], reference_image_urls = [], ratio = '720:1280' }) {
  // gen4_image_turbo with referenceImages — face-locked stills.
  // Accept either in-session character names OR explicit URLs (preferred for cross-turn continuity).
  const refs = [];
  for (const url of reference_image_urls) {
    refs.push({ uri: url, tag: `ref${refs.length+1}` });
  }
  for (const name of character_refs) {
    const c = SESSION.characters[name];
    if (!c || !c.portrait_url) {
      throw new Error(`character_refs: '${name}' is not registered in this session. Pass reference_image_urls instead with the URL from a prior lock_character tool_result.`);
    }
    refs.push({ uri: c.portrait_url, tag: name });
  }
  if (refs.length === 0) throw new Error('scene_with_characters needs at least one character_refs or reference_image_urls entry.');
  const payload = {
    promptText: prompt,
    model: 'gen4_image_turbo',
    ratio,
    referenceImages: refs,
  };
  const created = await runwayCreateTask({ endpoint: 'text_to_image', payload });
  const done = await runwayPollTask(created.id);
  const url = done.output && done.output[0];
  if (!url) throw new Error('Runway returned no image URL');
  return { url, ratio, prompt };
}

async function runTool(name, input) {
  if (name === 'plan') {
    return {
      forModel: 'Plan emitted to UI. Now execute the plan.',
      forUI: { kind: 'plan', steps: input.steps || [], rationale: input.rationale || '' },
    };
  }
  if (name === 'generate_image') {
    const { url, prompt } = await toolGenerateImage(input);
    return {
      forModel: `Generated image url: ${url}\nPrompt: ${prompt}`,
      forUI: { kind: 'image', url, label: input.label || 'Image' },
    };
  }
  if (name === 'animate_image') {
    const r = await toolAnimateImage(input);
    if (r.url) {
      return {
        forModel: `Generated video url: ${r.url} (model=${r.model}, duration ${r.duration}s)`,
        forUI: { kind: 'video', url: r.url, label: input.label || 'Motion clip' },
      };
    }
    return {
      forModel: `animate_image task started. taskId=${r.taskId} (model=${r.model}). Use poll_task with task_id="${r.taskId}" in 30-90s to retrieve the MP4.`,
      forUI: { kind: 'text', text: `Motion clip pending. task_id=${r.taskId}. Use poll_task tool to fetch the MP4 (30-180s).`, label: input.label || 'Motion clip pending', taskId: r.taskId, requestId: r.taskId, pendingKind: 'animate_image' },
    };
  }
  if (name === 'speak') {
    const { url, bytes } = await toolSpeak({ text: input.text, voice_id: input.voice_id, pace: input.pace });
    return {
      forModel: `Voice clip generated (${bytes} bytes mp3${input.pace ? ', pace=' + input.pace : ''}).`,
      forUI: { kind: 'audio', url, label: input.label || 'Voice', text: input.text },
    };
  }
  if (name === 'write_html') {
    // Validate: Claude occasionally calls this tool with only label and no html body.
    if (!input.html || typeof input.html !== 'string' || input.html.length < 80) {
      throw new Error('write_html called without an html body — return again with the full HTML document in the html field, starting with <!doctype html>.');
    }
    return {
      forModel: 'HTML page emitted to UI.',
      forUI: { kind: 'html', html: input.html, label: input.label || 'Page' },
    };
  }
  if (name === 'write_text') {
    if (!input.text || typeof input.text !== 'string' || input.text.length < 10) {
      throw new Error('write_text called without a text body — return again with the actual text in the text field.');
    }
    return {
      forModel: 'Text deliverable emitted to UI.',
      forUI: { kind: 'text', text: input.text, label: input.label || 'Output' },
    };
  }
  if (name === 'read_url') {
    const { text, contentType } = await toolReadUrl(input);
    return {
      forModel: `Fetched ${input.url} (${contentType}, ${text.length} chars):\n\n${text}`,
      forUI: { kind: 'text', text: text.slice(0, 1200) + (text.length > 1200 ? '\n…[full content sent to model]' : ''), label: 'Read: ' + input.url },
    };
  }

  if (name === 'lock_character') {
    const { portrait_url, name: charName, voice_preset, personality } = input;
    if (!portrait_url || !charName) throw new Error('lock_character requires portrait_url and name.');
    let avatarId = null;
    let voicePreset = voice_preset || 'adrian';
    let avatarErr = null;
    try {
      const r = await runwayCreateAvatar({ portrait_url, name: charName, voice_preset: voicePreset, personality });
      avatarId = r.avatarId;
    } catch (e) {
      avatarErr = String(e.message).slice(0, 600);
      console.warn('runwayCreateAvatar failed:', avatarErr);
    }
    SESSION.characters[charName] = { avatarId, portrait_url, voicePreset };
    return {
      forModel: `LOCKED character='${charName}' avatarId='${avatarId || 'null'}' voicePreset='${voicePreset}' portrait_url='${portrait_url}'. To use across future turns: pass avatar_id='${avatarId || 'null'}' to talking_head and pass reference_image_urls=['${portrait_url}'] to scene_with_characters. ${avatarErr ? 'Error: ' + avatarErr : ''}`,
      forUI: avatarErr
        ? { kind: 'text', text: `Avatar create error for '${charName}':\n${avatarErr}\n\nPortrait stored — scene_with_characters will still work for face-locked stills.`, label: `Locked: ${charName} (debug)`, avatarId: null, portrait_url, voicePreset }
        : { kind: 'image', url: portrait_url, label: `Locked: ${charName} (voice: ${voicePreset}) avatarId=${avatarId}`, avatarId, portrait_url, voicePreset },
    };
  }
  if (name === 'cast_voice') {
    const { tag, voice_id } = input;
    if (!tag || !voice_id) throw new Error('cast_voice requires tag and voice_id.');
    SESSION.voices[tag] = voice_id;
    return {
      forModel: `Voice for '${tag}' cast: ${voice_id}.`,
      forUI: { kind: 'text', text: `Voice ${tag} → ${voice_id}`, label: 'Voice cast' },
    };
  }
  if (name === 'scene_with_characters') {
    const { url, prompt } = await toolGenerateImageWithRefs(input);
    return {
      forModel: `Scene with character refs (${(input.character_refs||[]).join(', ')}) generated. URL: ${url}`,
      forUI: { kind: 'image', url, label: input.label || 'Scene' },
    };
  }
  if (name === 'talking_head') {
    const { character, avatar_id, text, label } = input;
    let resolvedAvatarId = avatar_id;
    if (!resolvedAvatarId && character) {
      const charObj = SESSION.characters[character];
      if (charObj && charObj.avatarId) resolvedAvatarId = charObj.avatarId;
    }
    if (!resolvedAvatarId) throw new Error(`talking_head requires either avatar_id (preferred) or character (in-session). Provide avatar_id from a prior lock_character tool_result.`);
    try { await runwayWaitAvatarReady(resolvedAvatarId, { maxMs: 8000 }); } catch (e) { /* surface in next step */ }
    const audio_url = input.audio_url;
    const { taskId } = await runwayCreateAvatarVideo({ avatarId: resolvedAvatarId, audioUrl: audio_url, text });
    // Try a short inline poll inside Edge budget (max ~12s). If task isn't done, return task_id for client-side poll.
    const done = await runwayPollTask(taskId, { maxMs: 12000, intervalMs: 2000 }).catch(() => null);
    if (done && done.output && done.output[0]) {
      return {
        forModel: `Talking head rendered: ${done.output[0]} (avatar=${resolvedAvatarId})`,
        forUI: { kind: 'video', url: done.output[0], label: label || `${character || 'avatar'}: ${(text || 'audio').slice(0, 40)}` },
      };
    }
    return {
      forModel: `Talking head task started. taskId=${taskId} avatarId=${resolvedAvatarId} src="${(text || input.audio_url || "").slice(0,80)}". Call poll_task with task_id="${taskId}" in 30-90s to retrieve the MP4.`,
      forUI: { kind: 'text', text: `Talking-head pending. task_id=${taskId}. Use poll_task tool with task_id to fetch the MP4 (60-180s).`, label: label || `${character || 'avatar'}: pending` },
    };
  }
  if (name === 'poll_task') {
    const { task_id, label } = input;
    if (!task_id) throw new Error('poll_task requires task_id.');
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(task_id)) {
      throw new Error(`invalid task_id format (expected UUID, got '${task_id.slice(0, 40)}')`);
    }
    requireKey('RUNWAY_API_KEY');
    const r = await fetch(`https://api.dev.runwayml.com/v1/tasks/${task_id}`, {
      headers: {
        'Authorization': `Bearer ${process.env.RUNWAY_API_KEY}`,
        'X-Runway-Version': RUNWAY_VERSION,
      },
    });
    if (r.status === 404) throw new Error(`task not found (id=${task_id.slice(0, 8)}...)`);
    if (!r.ok) {
      const txt = await r.text();
      if (r.status === 400 && txt.includes('invalid_format')) throw new Error(`invalid task_id format`);
      throw new Error(`Runway ${r.status}: ${txt.slice(0, 200)}`);
    }
    const j = await r.json();
    if (j.status === 'SUCCEEDED') {
      const url = j.output && j.output[0];
      if (!url) throw new Error(`poll_task: SUCCEEDED but no output URL`);
      const isVideo = /\.mp4(\?|$)/i.test(url);
      return {
        forModel: `Task ${task_id} SUCCEEDED: ${url}`,
        forUI: { kind: isVideo ? 'video' : 'image', url, label: label || `Task ${task_id.slice(0, 8)}` },
      };
    }
    if (j.status === 'FAILED' || j.status === 'CANCELED') {
      const reason = j.failure || j.failureCode || j.failureReason || 'no reason given';
      return {
        forModel: `Task ${task_id} ${j.status}: ${reason}`,
        forUI: { kind: 'text', text: `Task ${j.status}: ${reason}`, label: label || `Task ${task_id.slice(0,8)} ${j.status}`, status: j.status, reason },
      };
    }
    return {
      forModel: `Task ${task_id} ${j.status} (still processing). Try poll_task again in 30-60s.`,
      forUI: { kind: 'text', text: `Status: ${j.status}. Try again in 30-60s.`, label: label || `Task ${task_id.slice(0,8)} ${j.status}`, status: j.status },
    };
  }
  if (name === 'cinematic_video') {
    const { image_url, prompt, duration, resolution, aspect_ratio, label } = input;
    if (!image_url || !prompt) throw new Error('cinematic_video requires image_url and prompt.');
    const r = await falSeedanceImageToVideo({ image_url, prompt, duration, resolution, aspect_ratio });
    // Brief 8s grace check in case render lands fast (rare but possible for short i2v clips)
    await new Promise(res => setTimeout(res, 8000));
    const check = await falPollSeedance({ request_id: r.requestId }).catch(() => ({ status: 'IN_PROGRESS' }));
    if (check.status === 'COMPLETED' && check.url) {
      return {
        forModel: `Seedance task ${r.requestId} COMPLETED inline: ${check.url}`,
        forUI: { kind: 'video', url: check.url, label: label || 'Cinematic clip' },
      };
    }
    return {
      forModel: `Seedance 2.0 task started. request_id="${r.requestId}". Status: ${check.status}. Render takes 2-3 min. DO NOT poll again in this turn — the UI shows a Pending Renders panel; the user will fetch when ready. Move on or end the turn.`,
      forUI: { kind: 'text', text: `Cinematic video pending. request_id=${r.requestId}. Use cinematic_video_poll (2-3 min).`, label: label || 'Cinematic clip pending', requestId: r.requestId },
    };
  }
  if (name === 'cinematic_video_t2v') {
    const { prompt, duration, resolution, aspect_ratio, label } = input;
    if (!prompt) throw new Error('cinematic_video_t2v requires prompt.');
    const r = await falSeedanceTextToVideo({ prompt, duration, resolution, aspect_ratio });
    await new Promise(res => setTimeout(res, 8000));
    const check = await falPollSeedance({ request_id: r.requestId }).catch(() => ({ status: 'IN_PROGRESS' }));
    if (check.status === 'COMPLETED' && check.url) {
      return {
        forModel: `Seedance T2V task ${r.requestId} COMPLETED inline: ${check.url}`,
        forUI: { kind: 'video', url: check.url, label: label || 'Cinematic clip' },
      };
    }
    return {
      forModel: `Seedance 2.0 T2V task started. request_id="${r.requestId}". Status: ${check.status}. Render takes 2-3 min. DO NOT poll again in this turn — the UI shows a Pending Renders panel; the user will fetch when ready. End the turn cleanly.`,
      forUI: { kind: 'text', text: `Cinematic video pending. request_id=${r.requestId}.`, label: label || 'Cinematic clip pending', requestId: r.requestId },
    };
  }
  if (name === 'cinematic_video_poll') {
    const { request_id, label } = input;
    if (!request_id) throw new Error('cinematic_video_poll requires request_id.');
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(request_id)) {
      throw new Error(`invalid request_id format (expected UUID)`);
    }
    await new Promise(res => setTimeout(res, 12000));
    const r = await falPollSeedance({ request_id }).catch(e => {
      const msg = String(e.message || e);
      if (msg.includes('405') || msg.includes('404')) throw new Error(`task not found (id=${request_id.slice(0, 8)}...)`);
      throw e;
    });
    if (r.status !== 'COMPLETED') {
      return {
        forModel: `Seedance task ${request_id} status=${r.status} after 12s wait. DO NOT poll again in this turn. Tell the user the UI's Pending Renders panel will let them fetch when ready, then end the turn.`,
        forUI: { kind: 'text', text: `Status: ${r.status}. Use the Pending Renders panel to fetch when Seedance finishes (~2-3 min total).`, label: label || `Seedance ${r.status}`, status: r.status },
      };
    }
    return {
      forModel: `Seedance task ${request_id} COMPLETED: ${r.url}`,
      forUI: { kind: 'video', url: r.url, label: label || 'Cinematic clip' },
    };
  }
  if (name === 'lock_brief') {
    const { mode, questionnaire, brief, label } = input;
    if (mode === 'interview') {
      if (!questionnaire || !Array.isArray(questionnaire) || questionnaire.length < 4) {
        throw new Error('lock_brief mode:interview requires questionnaire (array of 4-12 questions).');
      }
      const md = questionnaire.map((q,i)=>`${i+1}. ${q}`).join('\n');
      return {
        forModel: `Interview emitted to UI. STOP after this turn. Wait for user answers in the follow-up message, then call lock_brief mode:finalize with answers + brief.`,
        forUI: { kind: 'text', text: `**Director's questions** (answer all in one reply, then I'll lock the brief and shoot):\n\n${md}`, label: label || 'Director: brief intake' },
      };
    }
    if (mode === 'finalize') {
      if (!brief || typeof brief !== 'object') throw new Error('lock_brief mode:finalize requires brief object.');
      const briefMd = '```json\n' + JSON.stringify(brief, null, 2) + '\n```';
      return {
        forModel: `Brief locked. Now execute the brief deterministically — scene_with_characters, cinematic_video for each beat. Do not ask further questions.`,
        forUI: { kind: 'text', text: `**Brief locked. Shooting now.**\n\n${briefMd}`, label: label || 'Director: brief locked' },
      };
    }
    throw new Error('lock_brief mode must be "interview" or "finalize".');
  }
  if (name === 'list_avatars') {
    requireKey('RUNWAY_API_KEY');
    const r = await fetch('https://api.dev.runwayml.com/v1/avatars?limit=50', {
      headers: { 'Authorization': `Bearer ${process.env.RUNWAY_API_KEY}`, 'X-Runway-Version': RUNWAY_VERSION },
    });
    if (!r.ok) throw new Error(`Runway list_avatars ${r.status}: ${await r.text()}`);
    const j = await r.json();
    const items = (j.data || j.avatars || []).map(a => ({
      id: a.id, name: a.name, status: a.status,
      referenceImageUri: a.referenceImageUri || null,
      voice: a.voice && (a.voice.presetId || a.voice.id) || null,
    }));
    const summary = items.map(it => `- ${it.name} | id=${it.id} | status=${it.status} | voice=${it.voice}`).join('\n');
    return {
      forModel: `Found ${items.length} avatars:\n${summary}`,
      forUI: { kind: 'text', text: summary || 'No avatars found.', label: 'Runway avatars', avatars: items },
    };
  }
  if (name === 'compose_sleep_video') {
    const { image_url, video_url, audio_url, title, target_duration, label } = input;
    if (!audio_url) throw new Error('compose_sleep_video requires audio_url.');
    if (!image_url && !video_url) throw new Error('compose_sleep_video requires either image_url or video_url.');
    const dur = target_duration || 30;
    const safeTitle = (title || 'Sleep video').replace(/[<>\"&]/g, '');

    // IMAGE PATH — CSS Ken Burns (slow zoom + drift) over the still + audio. Atomic, instant, no Runway video needed.
    if (image_url && !video_url) {
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title><style>html,body{margin:0;background:#000;color:#fff;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh}h2{font-size:14px;letter-spacing:.15em;text-transform:uppercase;opacity:.6;margin:18px 0 12px}.frame{position:relative;max-width:380px;width:90vw;aspect-ratio:9/16;border-radius:16px;overflow:hidden;background:#000;box-shadow:0 30px 80px -10px rgba(0,0,0,.9)}.kb{position:absolute;inset:-8%;width:116%;height:116%;background-size:cover;background-position:center;animation:kenBurns ${dur}s ease-in-out infinite alternate}@keyframes kenBurns{0%{transform:scale(1) translate(0,0)}50%{transform:scale(1.08) translate(-2%,1%)}100%{transform:scale(1.04) translate(2%,-1%)}}.fade{position:absolute;inset:0;background:linear-gradient(180deg,transparent 60%,rgba(0,0,0,0.55) 100%);pointer-events:none}.ctl{margin-top:18px;display:flex;gap:10px}button{background:#ff5959;color:#fff;border:none;padding:12px 24px;border-radius:50px;font-weight:700;cursor:pointer;font-size:14px;letter-spacing:.04em}button.ghost{background:transparent;border:1px solid #444;color:#aaa}.meta{margin-top:14px;opacity:.5;font-size:11px;font-family:monospace;text-align:center;max-width:420px}</style></head><body><h2>${safeTitle}</h2><div class="frame"><div class="kb" style="background-image:url('${image_url}')"></div><div class="fade"></div><audio id="a" src="${audio_url}" preload="auto"></audio></div><div class="ctl"><button id="play">▶ PLAY</button><button id="restart" class="ghost">↻ Restart</button></div><div class="meta">Runway gen4_image still · ElevenLabs sleep narration · CSS Ken Burns · ${dur}s composed</div><script>(function(){const a=document.getElementById('a');let started=false;function start(){if(started)return;started=true;a.currentTime=0;a.play();}function ended(){started=false;document.getElementById('play').textContent='▶ REPLAY';}a.addEventListener('ended',ended);document.getElementById('play').addEventListener('click',start);document.getElementById('restart').addEventListener('click',()=>{started=false;a.pause();a.currentTime=0;start();});})();<\/script></body></html>`;
      return {
        forModel: `ATOMIC sleep video composed via CSS Ken Burns. Image ${image_url.slice(0, 60)}... + narration ${audio_url.slice(0, 60)}... → one finished playable widget. No queue. No pending. Done.`,
        forUI: { kind: 'html', html, label: label || (title || 'Sleep video — composed') },
      };
    }

    // VIDEO PATH — original ping-pong loop with motion clip.
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title><style>html,body{margin:0;background:#000;color:#fff;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh}h2{font-size:14px;letter-spacing:.15em;text-transform:uppercase;opacity:.6;margin:18px 0 12px}.frame{position:relative;max-width:380px;width:90vw;aspect-ratio:9/16;border-radius:16px;overflow:hidden;background:#000;box-shadow:0 30px 80px -10px rgba(0,0,0,.9)}video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.ctl{margin-top:18px;display:flex;gap:10px}button{background:#ff5959;color:#fff;border:none;padding:12px 24px;border-radius:50px;font-weight:700;cursor:pointer;font-size:14px;letter-spacing:.04em}button.ghost{background:transparent;border:1px solid #444;color:#aaa}.meta{margin-top:14px;opacity:.5;font-size:11px;font-family:monospace}</style></head><body><h2>${safeTitle}</h2><div class="frame"><video id="v" src="${video_url}" muted playsinline></video><audio id="a" src="${audio_url}" preload="auto"></audio></div><div class="ctl"><button id="play">▶ PLAY</button><button id="restart" class="ghost">↻ Restart</button></div><div class="meta">Runway gen4.5 motion · ElevenLabs sleep narration · ${dur}s composed</div><script>(function(){const v=document.getElementById('v'),a=document.getElementById('a'),target=${dur};let dir=1,started=false;function start(){if(started)return;started=true;a.currentTime=0;v.currentTime=0;v.play();a.play();}function bothEnded(){v.pause();a.pause();started=false;document.getElementById('play').textContent='▶ REPLAY';}v.addEventListener('timeupdate',()=>{const d=v.duration||10;if(dir>0&&v.currentTime>=d-0.05){dir=-1;v.playbackRate=1;requestPingPong();}else if(dir<0&&v.currentTime<=0.05){dir=1;v.playbackRate=1;v.play();}});function requestPingPong(){let lt=v.currentTime;function step(){if(!started)return;lt-=1/30;if(lt<=0){dir=1;v.currentTime=0;v.play();return;}v.currentTime=lt;requestAnimationFrame(step);}step();}a.addEventListener('ended',()=>{bothEnded();});document.getElementById('play').addEventListener('click',start);document.getElementById('restart').addEventListener('click',()=>{started=false;dir=1;a.pause();v.pause();start();});})();<\/script></body></html>`;
    return {
      forModel: `Sleep video composed. Synced ${video_url.slice(0, 60)}... + ${audio_url.slice(0, 60)}... in HTML widget. The user can now play it as one piece.`,
      forUI: { kind: 'html', html, label: label || (title || 'Sleep video — composed') },
    };
  }
  throw new Error(`Unknown tool: ${name}`);
}

// ---------- Skills (preset prompts that wrap the agent) ----------
const SKILLS = {
  // Director-first cinematic short — interview the user before spending Seedance credits
  director_short: 'You are Mini-Me operating in Director Mode. The user wants: %TOPIC%. STEP 1: Call lock_brief mode:"interview" with a batched questionnaire of 6-10 clarifying questions covering era/year, characters (count, look, names), POV (selfie/wide/over-shoulder/handheld), dialogue style (silent narrator/single voiceover/two-person conversation in period dialect), aspect_ratio, duration per beat, mood/music, style reference, budget cap (how many \$0.05 Seedance clips okay). STEP 2: STOP. Wait for user reply. STEP 3: When user replies, call lock_brief mode:"finalize" with their answers and a structured brief object. STEP 4: Execute the brief — for each scene call scene_with_characters then cinematic_video, poll, deliver. Bias to action AFTER the brief is locked, not before.',

  // Chloe-vs-history-style conversational short — face-locked characters in real environments, lip-synced dialogue
  conversational_short: 'Produce a 60-second Chloe-vs-history-style conversational short for: %TOPIC%. Plan first. Then: (1) generate_image for HER portrait (cinematic, front-facing, period-accurate); (2) generate_image for HIM portrait (same era + style); (3) lock_character for HER with voice_preset:emma (or ruby/luna for variety); (4) lock_character for HIM with voice_preset:drew (or adrian/marcus for variety); (5) write a 5-beat dialogue script with 8-12 exchanges, each line under 250 chars; (6) for each beat, scene_with_characters with character_refs:[HER,HIM] to render the environment still; (7) for EACH dialogue line, talking_head with the speaking character — produces lip-synced video; (8) emit final cut plan via write_text listing all clip URLs in order. Bias to action — do not stop until every line is rendered.',

  // Original universal skills (kept for general-purpose use)
  research_brief:  'Research this topic with web_search and produce a one-page brief: %TOPIC%. Include 5–7 numbered citations as [1], [2]… and a short executive summary. Use write_text for the brief.',
  build_landing:   'Build a complete one-page landing page (write_html) for: %TOPIC%. Modern, minimal, mobile-friendly, dark-mode default, hero + 3 sections + signup. Strong, specific copy. No external assets except via CDN.',
  image_to_motion: 'Generate a cinematic still for: %TOPIC%. Then animate it for 5 seconds with subtle camera/subject motion. Return both deliverables.',
  voice_clip:      'Read this aloud in Mini-Me voice with `speak`: %TOPIC%',
  pitch_deck_html: 'Build a 6-slide pitch deck as a single HTML file (write_html) for: %TOPIC%. Use distinct sections per slide, large type, deep contrast. Slide-nav with arrow keys would be great.',
  brand_kit:       'Design a brand kit for: %TOPIC%. Output a single HTML page (write_html) showing: logo concept (CSS+SVG), 5-color palette with hex codes, font pairing recommendation with web links, 3 mood-board image prompts, and one-paragraph brand voice description. Modern reference design.',
  marketing_copy:  'Generate a marketing copy bundle for: %TOPIC%. Use write_text to deliver: 5 headline options, 3 CTA buttons, 5 social posts (X/LinkedIn-style), and one elevator pitch. Specific, vivid, no clichés.',
  cold_email:      'Write a 5-touch cold-email sequence for: %TOPIC%. Use write_text. Each email: subject + body, under 120 words, casual, value-led, with a soft CTA. Number the emails 1–5.',
  competitor_scan: 'Use web_search to identify the top 5 competitors for: %TOPIC%. For each, gather: positioning, pricing, key differentiator, recent news. Output a side-by-side comparison table with write_html.',

  // === LAUNCH AGENT SKILLS — the autonomous-momentum-capture vertical slice ===
  analyze_signal: 'A solo founder noticed a traction signal: %TOPIC%. Use web_search if a YouTube channel URL or app/site is named, otherwise reason from what they describe. Identify: (1) what genre/category this falls in, (2) what specific pattern is working (length, format, language, presentation), (3) the top 3 channels/apps doing it well right now, (4) what is the WINNING TEMPLATE the algorithm seems to reward. Output a structured strategic memo with write_text. End with a one-line recommendation: should they double down, pivot, or move on.',

  build_channel_strategy: 'A solo founder wants to launch around this signal: %TOPIC%. Build them a complete YouTube channel strategy as a single HTML page (write_html). Include: channel name + tagline + brand positioning, full visual identity (3-color palette + font pairing + logo concept SVG), playlist taxonomy with at least 4 distinct series, naming convention (e.g., PROTOCOL N, EPISODE N), 10 video concepts spanning short-form and long-form, a 30-day upload calendar with specific dates and titles, and a multilingual rollout plan. Make it cinematic, modern, dark mode, premium tech aesthetic. The whole thing should look like a launch brief a $1B founder would commission from a top agency.',

  generate_protocol: 'A solo founder wants the next sleep / protocol video for: %TOPIC%. ATOMIC ONE-PUSH PIPELINE — total runtime ~15s, no queue, no Runway video, no pending taskIds. The user pressed one button — they get one finished product back, in one run. STEP 0 — SCRIPT SOURCING (NON-NEGOTIABLE): scan %TOPIC% for quoted narrator text (double quotes, single quotes, smart quotes, or labelled with phrases like "narrator says:" / "voiceover:" / "she whispers:"). IF FOUND, that quoted text IS the narration — pass it verbatim to speak. Do NOT write a "Protocol N" monologue on top of it. Do NOT expand. Do NOT replace. Use only the user\'s words. IF NO QUOTE is in %TOPIC%, then (and only then) you may write a 60-120 word narration that stays on the topic and mood the user named. EXECUTE THESE THREE TOOLS IN ORDER: (1) generate_image with MCSLA structure for the cinematic hero still that matches %TOPIC% — ratio 720:1280 vertical, hyper-realistic, golden-hour-to-blue-hour palette. (2) speak with pace:"sleep" passing the VERBATIM user script (or your written narration if no quote was provided) — produces the audio URL. (3) compose_sleep_video — MANDATORY FINAL STEP — pass image_url (from step 1) + audio_url (from step 2). It applies CSS Ken Burns motion to the still under the narration. ABSOLUTELY DO NOT call animate_image — Runway video synthesis blows the Edge budget and forces a queue handoff which breaks the one-push promise. (4) write_text — ONLY for descriptive metadata (video title, YouTube description with timestamps, 8 SEO tags, upload instructions). Sleep-tech aesthetic: dark, calming, engineered for overactive minds.',

  thumbnail_pack: 'A solo founder needs YouTube thumbnails for: %TOPIC%. Call generate_image FOUR times to produce 4 distinct thumbnail concepts at 1280:720 ratio. Each thumbnail prompt should be cinematic, premium, attention-grabbing in YouTube grid view, and tonally consistent with sleep-tech / engineered-calm aesthetic. After all four images render, write_text a one-paragraph brief explaining which thumbnail tests strongest and why.',

  multilingual_pack: 'A solo founder wants to internationalize this content: %TOPIC%. Use write_text to produce: (1) the original English narration script (200-400 words), (2) translated narration scripts for Spanish, Portuguese, French, German, Japanese — each fully localized, not just translated, with cultural cadence appropriate to sleep/meditation in each language, (3) localized YouTube titles + descriptions for each language, (4) recommended thumbnail variations per language. Then call speak for each language using eleven_multilingual_v2 to produce voice samples (chunk under 600 chars).',

  detect_traction: 'Analyze whether this signal is real traction or noise: %TOPIC%. Use web_search to look up the named channel/app/product. Compare its recent metrics (if observable from public info) to category baselines. Output a write_text verdict: (a) Is the signal real? (b) What is the curve doing — accelerating, plateauing, decaying? (c) Recommended action: ship a launch system NOW, gather more data, or move on. Be honest, founder-grade — this is not cheerleading, it is decision support.',
};

// ---------- Main handler ----------
export default async function handler(req) {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  let body;
  try { body = await req.json(); }
  catch { return new Response('Invalid JSON', { status: 400 }); }

  let prompt = (body && body.prompt || '').trim();
  const history = Array.isArray(body && body.history) ? body.history : [];
  const skill = body && body.skill;

  if (skill && SKILLS[skill]) {
    prompt = SKILLS[skill].replace('%TOPIC%', prompt || 'a delightful surprise');
  }
  if (!prompt) return new Response('Missing prompt', { status: 400 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response('Server missing ANTHROPIC_API_KEY env var. Set it in Vercel project settings.', { status: 500 });
  }

  // === DIRECT TOOL EXECUTION SHORT-CIRCUIT ===
  // Bypass Claude reasoning entirely when user supplies an explicit tool spec.
  // Format: prompt starts with "EXEC:" followed by JSON like:
  //   EXEC: {"tool":"animate_image","input":{"image_url":"https://...","prompt":"...","duration":5,"label":"..."}}
  // Use this for guaranteed deterministic tool calls (no Claude summarization).
  const execMatch = prompt.match(/^\s*EXEC:\s*(\{[\s\S]*\})\s*$/);
  if (execMatch) {
    let spec;
    try { spec = JSON.parse(execMatch[1]); }
    catch (e) {
      return new Response('EXEC: payload must be valid JSON. ' + e.message, { status: 400 });
    }
    if (!spec.tool || typeof spec.tool !== 'string') {
      return new Response('EXEC: payload requires {"tool":"..."}', { status: 400 });
    }
    const stream = new ReadableStream({
      async start(controller) {
        const close = () => { try { controller.close(); } catch {} };
        const send = (event, data) => { try { sse(controller, event, data); } catch {} };
        send('start', { ts: Date.now(), prompt: 'EXEC: ' + spec.tool, mode: 'direct' });
        send('tool_call', { name: spec.tool, input: spec.input || {} });
        try {
          const { forModel, forUI } = await runTool(spec.tool, spec.input || {});
          send('tool_result', forUI);
          send('final', { text: 'Direct tool execution complete: ' + spec.tool, assistant_content: [] });
        } catch (e) {
          send('error', { text: `${spec.tool}: ${String(e.message || e)}` });
        } finally {
          send('done', { ok: true });
          close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const close = () => { try { controller.close(); } catch {} };
      const send = (event, data) => { try { sse(controller, event, data); } catch {} };

      // Build messages: prior turn pairs + current user message
      const messages = [];
      for (const turn of history) {
        if (turn && turn.role && turn.content) messages.push({ role: turn.role, content: turn.content });
      }
      messages.push({ role: 'user', content: prompt });

      send('start', { ts: Date.now(), prompt, model: ANTHROPIC_MODEL });

      try {
        for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
          let resp;
          try {
            resp = await callClaude({ messages });
          } catch (e) {
            send('error', { text: String(e.message || e) });
            break;
          }

          messages.push({ role: 'assistant', content: resp.content });

          // Surface text blocks as "thoughts"
          for (const block of resp.content || []) {
            if (block.type === 'text' && block.text && block.text.trim()) {
              send('thought', { text: block.text.trim() });
            }
          }

          // Capture web_search results (Anthropic server-tool blocks) for sources panel
          for (const block of resp.content || []) {
               if (block.type === 'web_search_tool_result') {
              const items = (block.content || []).map(it => ({
                title: it.title || '',
                url: it.url || '',
                snippet: it.encrypted_content ? '' : (it.text || it.content || '')
              })).filter(it => it.url);
              if (items.length) {
                send('tool_result', { kind: 'search', results: items, label: 'Sources' });
              }
            }
          }

          const toolUses = (resp.content || []).filter(b => b.type === 'tool_use');

          if (resp.stop_reason === 'end_turn' || toolUses.length === 0) {
            const finalText = (resp.content || [])
              .filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
            send('final', { text: finalText, assistant_content: resp.content });
            break;
          }

          const toolResults = [];
          for (const tu of toolUses) {
            send('tool_call', { name: tu.name, input: tu.input });
            try {
              const { forModel, forUI } = await runTool(tu.name, tu.input || {});
              send('tool_result', forUI);
              toolResults.push({
                type: 'tool_result',
                tool_use_id: tu.id,
                content: forModel,
              });
            } catch (e) {
              const msg = String(e.message || e);
              send('error', { text: `${tu.name}: ${msg}` });
              toolResults.push({
                type: 'tool_result',
                tool_use_id: tu.id,
                content: `Error: ${msg}`,
                is_error: true,
              });
            }
          }
          messages.push({ role: 'user', content: toolResults });
        }
      } catch (e) {
        send('error', { text: String(e.message || e) });
      } finally {
        send('done', { ok: true });
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
