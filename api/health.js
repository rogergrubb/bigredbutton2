// Big Red Button — health endpoint
// GET /api/health -> {ok, keys: {anthropic, runway, elevenlabs}, model}

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'GET') return new Response('GET only', { status: 405 });
  const body = {
    ok: true,
    ts: Date.now(),
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
    voice_id: process.env.ELEVENLABS_VOICE_ID || 'NfHkocJCWwrSqAxfTcxk',
    keys: {
      anthropic:  !!process.env.ANTHROPIC_API_KEY,
      runway:     !!process.env.RUNWAY_API_KEY,
      elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    },
    capabilities: {
      reasoning:        !!process.env.ANTHROPIC_API_KEY,
      web_search:       !!process.env.ANTHROPIC_API_KEY,
      write_html:       !!process.env.ANTHROPIC_API_KEY,
      write_text:       !!process.env.ANTHROPIC_API_KEY,
      generate_image:   !!(process.env.ANTHROPIC_API_KEY && process.env.RUNWAY_API_KEY),
      animate_image:    !!(process.env.ANTHROPIC_API_KEY && process.env.RUNWAY_API_KEY),
      speak:            !!(process.env.ANTHROPIC_API_KEY && process.env.ELEVENLABS_API_KEY),
      avatar_video:     !!(process.env.ANTHROPIC_API_KEY && process.env.ELEVENLABS_API_KEY && process.env.RUNWAY_API_KEY),
    },
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
