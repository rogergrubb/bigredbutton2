// /api/dashboard — returns live metrics for the Command Center.
//
// Sources wired (graceful fallback to last-known when an API is unavailable):
//   1. ElevenLabs    — /v1/user/subscription      (uses ELEVENLABS_API_KEY env)
//   2. Runway         — /v1/organization           (uses RUNWAY_API_KEY env)
//   3. YouTube        — /youtube/v3/channels       (uses YT_API_KEY env, optional)
//   4. Vercel runtime — deployment metadata from env (no API call)
//
// All keys already in Vercel env. No client-side exposure.
// Cached for 60s via Edge runtime cache headers.

export const config = { runtime: 'edge' };

const CACHE_SECONDS = 60;

// ===== Last-known values (used if a live API call fails or env var missing) =====
const FALLBACK = {
  youtube: {
    council_of_fifty: { views: 242, watchHours: 11.8, subscribers: 2, videos: 91 },
    sleep_tech_super: { views: 0, watchHours: 0, subscribers: 0, videos: 1 },
  },
  elevenlabs: { characters_used: null, characters_limit: null, voice_count: null, status: 'fallback' },
  runway:     { credits_remaining: null, status: 'fallback' },
  vercel:     { region: null, deployment_id: null, deploy_time: null, status: 'fallback' },
};

// ---------- ElevenLabs ----------
// Tries endpoints in fallback order. The TTS-only API key Roger uses has limited
// scope — /v1/user/subscription returns 401 unless the key has 'user_read' permission.
// We progressively degrade to endpoints that work with weaker scopes so something
// useful comes back regardless.
async function fetchElevenLabs(key) {
  if (!key) return { ...FALLBACK.elevenlabs, status: 'missing_key' };
  const headers = { 'xi-api-key': key, 'Accept': 'application/json' };
  const tries = [];

  // Attempt 1: full subscription endpoint (needs 'user_read' scope)
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers });
    tries.push({ path: '/v1/user/subscription', status: r.status });
    if (r.ok) {
      const d = await r.json();
      return {
        characters_used:  d.character_count ?? null,
        characters_limit: d.character_limit ?? null,
        tier:             d.tier ?? 'unknown',
        voice_limit:      d.voice_limit ?? null,
        voice_count:      d.voice_count ?? null,
        next_reset:       d.next_character_count_reset_unix ?? null,
        source:           '/v1/user/subscription',
        status: 'ok',
      };
    }
  } catch (e) {
    tries.push({ path: '/v1/user/subscription', error: e.message || String(e) });
  }

  // Attempt 2: /v1/user (sometimes works with weaker scopes, sometimes returns subscription nested)
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/user', { headers });
    tries.push({ path: '/v1/user', status: r.status });
    if (r.ok) {
      const d = await r.json();
      const sub = d.subscription || {};
      return {
        characters_used:  sub.character_count ?? null,
        characters_limit: sub.character_limit ?? null,
        tier:             sub.tier ?? d.subscription_tier ?? 'unknown',
        voice_count:      null,
        source:           '/v1/user',
        status: 'ok',
      };
    }
  } catch (e) {
    tries.push({ path: '/v1/user', error: e.message || String(e) });
  }

  // Attempt 3: /v1/voices (the broadest-scope endpoint — almost always accessible)
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers });
    tries.push({ path: '/v1/voices', status: r.status });
    if (r.ok) {
      const d = await r.json();
      const voices = d.voices || [];
      return {
        characters_used:  null,
        characters_limit: null,
        tier:             'unknown',
        voice_count:      voices.length,
        voice_sample:     voices.slice(0, 5).map(v => v.name).filter(Boolean),
        source:           '/v1/voices',
        status: 'ok',
      };
    }
  } catch (e) {
    tries.push({ path: '/v1/voices', error: e.message || String(e) });
  }

  return { ...FALLBACK.elevenlabs, status: 'all_failed', tries };
}

// ---------- Runway ----------
async function fetchRunway(key) {
  if (!key) return { ...FALLBACK.runway, status: 'missing_key' };
  try {
    const r = await fetch('https://api.dev.runwayml.com/v1/organization', {
      headers: {
        'Authorization': 'Bearer ' + key,
        'X-Runway-Version': '2024-11-06',
        'Accept': 'application/json',
      },
    });
    if (!r.ok) return { ...FALLBACK.runway, status: `http_${r.status}` };
    const d = await r.json();
    return {
      credits_remaining: d.credits ?? null,
      tier:              d.tier ?? null,
      usage_today:       d.usage?.today ?? null,
      status: 'ok',
    };
  } catch (e) {
    return { ...FALLBACK.runway, status: 'error:' + (e.message || e) };
  }
}

// ---------- YouTube ----------
// Council of Fifty handle: @TheCouncilOfFifty  → channel ID resolution via API
// Sleep Tech Super Channel: @SleepTechSuperChannel
// Looks up by handle. Requires YT_API_KEY env var.
async function fetchYouTube(key) {
  if (!key) {
    return {
      ...FALLBACK.youtube,
      status: 'missing_key',
    };
  }
  async function statsForHandle(handle) {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&forHandle=${encodeURIComponent(handle)}&key=${key}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json();
    const c = d.items?.[0];
    if (!c) return null;
    const s = c.statistics || {};
    return {
      title: c.snippet?.title || handle,
      views: parseInt(s.viewCount || '0', 10),
      subscribers: parseInt(s.subscriberCount || '0', 10),
      videos: parseInt(s.videoCount || '0', 10),
      // YouTube doesn't expose watch-time on the channels endpoint — that's Analytics API (OAuth required).
      // We surface an estimate based on avg-view-duration assumption if needed.
      watchHours: null,
    };
  }
  try {
    const [council, sleepTech] = await Promise.all([
      statsForHandle('TheCouncilOfFifty'),
      statsForHandle('SleepTechSuperChannel'),
    ]);
    return {
      council_of_fifty: council || FALLBACK.youtube.council_of_fifty,
      sleep_tech_super: sleepTech || FALLBACK.youtube.sleep_tech_super,
      status: (council && sleepTech) ? 'ok' : 'partial',
    };
  } catch (e) {
    return { ...FALLBACK.youtube, status: 'error:' + (e.message || e) };
  }
}

// ---------- Vercel runtime metadata (no external call) ----------
function vercelInfo() {
  return {
    region:        process.env.VERCEL_REGION        || 'unknown',
    env:           process.env.VERCEL_ENV           || 'unknown',
    deployment_id: process.env.VERCEL_DEPLOYMENT_ID || null,
    git_sha:       (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
    git_branch:    process.env.VERCEL_GIT_COMMIT_REF || null,
    deploy_time:   process.env.VERCEL_DEPLOYMENT_ID
                   ? new Date(parseInt(process.env.VERCEL_DEPLOYMENT_ID.split('_')[0] || '0', 36) || Date.now()).toISOString()
                   : new Date().toISOString(),
    status: 'ok',
  };
}

// ---------- Handler ----------
export default async function handler(req) {
  const t0 = Date.now();
  const [elevenlabs, runway, youtube] = await Promise.all([
    fetchElevenLabs(process.env.ELEVENLABS_API_KEY),
    fetchRunway(process.env.RUNWAY_API_KEY),
    fetchYouTube(process.env.YT_API_KEY || process.env.YOUTUBE_API_KEY),
  ]);
  const vercel = vercelInfo();

  const payload = {
    ts: Date.now(),
    elapsed_ms: Date.now() - t0,
    youtube,
    elevenlabs,
    runway,
    vercel,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=300`,
      'Access-Control-Allow-Origin': '*',
    },
  });
}
