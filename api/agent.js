// Big Red Button — universal autonomous agent
// Vercel Edge Function. POST {prompt} -> SSE stream of agent steps + results.
// Brain: Claude (tool-use loop). Tools: Runway (image+video), ElevenLabs (voice),
// HTML synth, web search (Anthropic server-side tool).
//
// Required env vars (set in Vercel project settings):
//   ANTHROPIC_API_KEY
//   RUNWAY_API_KEY
//   ELEVENLABS_API_KEY
// Optional:
//   ELEVENLABS_VOICE_ID  (default: Roger's clone)
//   ANTHROPIC_MODEL      (default: claude-sonnet-4-5)

export const config = { runtime: 'edge' };

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const DEFAULT_VOICE   = process.env.ELEVENLABS_VOICE_ID || 'NfHkocJCWwrSqAxfTcxk'; // Roger Grubb (NumberOneSon)
const RUNWAY_VERSION  = '2024-11-06';
const MAX_AGENT_TURNS = 8;

const TOOLS = [
  {
    name: 'generate_image',
    description: 'Generate a still image from a text prompt using Runway gen4_image_turbo. Use this to create hero shots, illustrations, product imagery, photographic compositions.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Detailed visual description. Be cinematic, specify lens/lighting/mood.' },
        ratio:  { type: 'string', description: 'Aspect ratio. One of: 1280:720, 720:1280, 1024:1024, 1920:1080.', default: '1280:720' },
        label:  { type: 'string', description: 'Short label shown above the result.' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'animate_image',
    description: 'Turn a still image into a 5-second motion video using Runway image-to-video (gen3a_turbo). Pass an image URL produced by generate_image, or any public image URL.',
    input_schema: {
      type: 'object',
      properties: {
        image_url: { type: 'string', description: 'Public URL of the still image to animate.' },
        prompt:    { type: 'string', description: 'How the camera/subject should move.' },
        duration:  { type: 'number', description: 'Duration in seconds. 5 or 10.', default: 5 },
        label:     { type: 'string', description: 'Short label for the result.' }
      },
      required: ['image_url', 'prompt']
    }
  },
  {
    name: 'speak',
    description: 'Synthesize speech in the user’s cloned voice using ElevenLabs. Returns a playable audio data URL.',
    input_schema: {
      type: 'object',
      properties: {
        text:  { type: 'string', description: 'Text to read aloud (under 1000 chars per call).' },
        voice_id: { type: 'string', description: 'Optional ElevenLabs voice id. Defaults to Roger’s cloned voice.' },
        label: { type: 'string', description: 'Short label for the result.' }
      },
      required: ['text']
    }
  },
  {
    name: 'write_html',
    description: 'Emit a complete, self-contained HTML page (single file, inline CSS, no external assets unless from a CDN) for landing pages, demos, or visualizations. The page renders inline as the final deliverable.',
    input_schema: {
      type: 'object',
      properties: {
        html:  { type: 'string', description: 'Complete HTML document. Must start with <!doctype html>.' },
        label: { type: 'string', description: 'Short label for the result.' }
      },
      required: ['html']
    }
  },
  {
    name: 'write_text',
    description: 'Emit a finalized text deliverable (article, summary, code, plan, email). Use when the deliverable is text-only.',
    input_schema: {
      type: 'object',
      properties: {
        text:  { type: 'string', description: 'The finished text deliverable.' },
        label: { type: 'string', description: 'Short label for the result.' }
      },
      required: ['text']
    }
  },
  // Anthropic server-side web search — handled by Anthropic, results returned to model directly.
  { type: 'web_search_20250305', name: 'web_search', max_uses: 4 }
];

const SYSTEM_PROMPT = `You are Mini-Me, the autonomous agent inside Big Red Button.

Mission: take ANY outcome the user states and ship it. You are the universal autonomous agent — combine the faculties of Cowork (file/desktop ops), Manus (long-horizon planning), Perplexity (research), and Lovable (vibe-coded sites) into a single execution loop.

How you work:
1. Read the user's outcome.
2. Briefly state your plan in one sentence (the UI shows it as a "thought").
3. Call the right tools in the right order. You may chain (image -> video, research -> write_text, etc.).
4. End with a clear final result. The user only sees the deliverables you produce via tools.

Style rules:
- Bias toward action, not asking. If the outcome is ambiguous, make a reasonable choice and ship.
- Prefer tools over prose. Every visible deliverable must come through a tool call.
- Be tasteful. Cinematic prompts for images. Tight copy for text. Modern, clean HTML.
- Keep tool inputs concise but specific. For images, spell out lens/lighting/mood/composition.
- If the user asks for voice, use \`speak\`. If they ask for a website/landing page, use \`write_html\`. If they ask for research, use \`web_search\` then \`write_text\`. If they ask for a video, chain \`generate_image\` -> \`animate_image\`.
- Never apologize for limitations. Just ship the closest excellent thing.`;

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
    throw new Error(`Anthropic ${r.status}: ${txt}`);
  }
  return r.json();
}

// ---------- Runway ----------
async function runwayCreateTask({ endpoint, payload }) {
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
    throw new Error(`Runway ${endpoint} ${r.status}: ${txt}`);
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
  throw new Error('Runway task polling timed out');
}

async function toolGenerateImage({ prompt, ratio = '1280:720' }) {
  const created = await runwayCreateTask({
    endpoint: 'text_to_image',
    payload: {
      promptText: prompt,
      model: 'gen4_image_turbo',
      ratio,
    },
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

// ---------- ElevenLabs ----------
async function toolSpeak({ text, voice_id }) {
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
    throw new Error(`ElevenLabs ${r.status}: ${txt}`);
  }
  const buf = await r.arrayBuffer();
  // base64 encode (edge-runtime safe via btoa over binary string)
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  const b64 = btoa(bin);
  return { url: `data:audio/mpeg;base64,${b64}`, bytes: bytes.length };
}

// ---------- Tool dispatcher ----------
async function runTool(name, input) {
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
      forModel: `Generated video url: ${url} (duration ${duration}s)\nMotion: ${prompt}`,
      forUI: { kind: 'video', url, label: input.label || 'Motion clip' },
    };
  }
  if (name === 'speak') {
    const { url, bytes } = await toolSpeak(input);
    return {
      forModel: `Voice clip generated (${bytes} bytes mp3). The clip is now visible to the user.`,
      forUI: { kind: 'audio', url, label: input.label || 'Voice' },
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
  throw new Error(`Unknown tool: ${name}`);
}

// ---------- Main handler ----------
export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('POST only', { status: 405 });
  }
  let body;
  try { body = await req.json(); }
  catch { return new Response('Invalid JSON', { status: 400 }); }

  const prompt = (body && body.prompt || '').trim();
  if (!prompt) return new Response('Missing prompt', { status: 400 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response('Server missing ANTHROPIC_API_KEY env var. Set it in Vercel project settings.', { status: 500 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const close = () => { try { controller.close(); } catch {} };
      const send = (event, data) => {
        try { sse(controller, event, data); } catch {}
      };

      send('thought', { text: `Outcome received: ${prompt.slice(0, 280)}` });

      const messages = [{ role: 'user', content: prompt }];

      try {
        for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
          let resp;
          try {
            resp = await callClaude({ messages });
          } catch (e) {
            send('error', { text: String(e.message || e) });
            break;
          }

          // Append assistant turn to history
          messages.push({ role: 'assistant', content: resp.content });

          // Surface assistant text blocks as "thoughts"
          for (const block of resp.content || []) {
            if (block.type === 'text' && block.text && block.text.trim()) {
              send('thought', { text: block.text.trim() });
            }
          }

          // Collect tool_use blocks
          const toolUses = (resp.content || []).filter(b => b.type === 'tool_use');

          if (resp.stop_reason === 'end_turn' || toolUses.length === 0) {
            const finalText = (resp.content || [])
              .filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
            send('final', { text: finalText });
            break;
          }

          // Run each tool, build tool_result blocks
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
