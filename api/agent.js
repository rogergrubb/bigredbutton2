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
const DEFAULT_VOICE   = process.env.ELEVENLABS_VOICE_ID || 'NfHkocJCWwrSqAxfTcxk';
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
    description: 'Turn a still image into a motion video (Runway gen3a_turbo). Pass an image URL and describe the camera/subject motion.',
    input_schema: {
      type: 'object',
      properties: {
        image_url: { type: 'string' },
        prompt:    { type: 'string' },
        duration:  { type: 'number', default: 5 },
        label:     { type: 'string' }
      },
      required: ['image_url', 'prompt']
    }
  },
  {
    name: 'speak',
    description: 'Synthesize speech in the cloned Mini-Me voice via ElevenLabs. Returns a playable audio data URL.',
    input_schema: {
      type: 'object',
      properties: {
        text:  { type: 'string' },
        voice_id: { type: 'string' },
        label: { type: 'string' }
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

Style:
- BIAS TO ACTION. If the outcome is ambiguous, choose tastefully and ship.
- Every visible deliverable goes through a tool. Don't return prose summaries that should be in write_text.
- For images: cinematic prompt with lens/light/mood/composition.
- For HTML: modern minimalist design, inline CSS, no external deps unless from a CDN, mobile-friendly.
- For research: web_search first, then write_text with citations as numbered footnotes [1], [2]…
- For voice: \`speak\` calls Mini-Me's cloned voice. Keep each clip < 600 chars.
- For videos: chain \`generate_image\` then \`animate_image\` (you cannot generate video directly).
- Never apologize for limitations. Just ship the closest excellent thing.

If a tool fails (e.g. missing API key), continue with the tools that DO work and surface a graceful note in your final summary.`;

function sse(controller, event, data) {
  const text = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(new TextEncoder().encode(text));
}

async function callClaude({ messages }) {
  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
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

async function toolAnimateImage({ image_url, prompt, duration = 5 }) {
  const created = await runwayCreateTask({
    endpoint: 'image_to_video',
    payload: {
      promptImage: image_url,
      promptText: prompt,
      model: 'gen3a_turbo',
      duration,
      ratio: '1280:768',
    },
  });
  const done = await runwayPollTask(created.id, { maxMs: 360000 });
  const url = done.output && done.output[0];
  if (!url) throw new Error('Runway returned no video URL');
  return { url, duration, prompt };
}

async function toolSpeak({ text, voice_id }) {
  requireKey('ELEVENLABS_API_KEY');
  const vid = voice_id || DEFAULT_VOICE;
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.65, similarity_boost: 0.85, style: 0.15, use_speaker_boost: true },
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
    const { url, duration, prompt } = await toolAnimateImage(input);
    return {
      forModel: `Generated video url: ${url} (duration ${duration}s)`,
      forUI: { kind: 'video', url, label: input.label || 'Motion clip' },
    };
  }
  if (name === 'speak') {
    const { url, bytes } = await toolSpeak(input);
    return {
      forModel: `Voice clip generated (${bytes} bytes mp3).`,
      forUI: { kind: 'audio', url, label: input.label || 'Voice', text: input.text },
    };
  }
  if (name === 'write_html') {
    return {
      forModel: 'HTML page emitted to UI.',
      forUI: { kind: 'html', html: input.html, label: input.label || 'Page' },
    };
  }
  if (name === 'write_text') {
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
  throw new Error(`Unknown tool: ${name}`);
}

// ---------- Skills (preset prompts that wrap the agent) ----------
const SKILLS = {
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

  generate_protocol: 'A solo founder wants the next protocol video for: %TOPIC%. Build the complete production package: (1) call generate_image to create a cinematic hero still for the protocol cover/thumbnail, (2) call animate_image to produce a slow ethereal motion clip from the still, (3) call speak to render a 30-60 second guided shutdown narration intro in Mini-Me voice, (4) use write_text to output the full 7-minute script, video title (with PROTOCOL N convention), description with timestamps, 8 SEO tags, and YouTube upload instructions. The aesthetic must be premium sleep-tech: dark, calming, engineered for overactive minds.',

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
