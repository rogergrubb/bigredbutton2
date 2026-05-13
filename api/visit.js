// /api/visit — real visitor log endpoint.
//
// POST  /api/visit  → records the current visitor's geo + ts to an in-memory ring buffer.
//                     Body is optional (client may supply { city, country, lat, lon, path }
//                     for ipapi.co-style fallback when Vercel geo headers are missing).
//                     Reads Vercel's x-vercel-ip-* headers when available — those are free
//                     and accurate. Anonymizes IP before storing.
//
// GET   /api/visit  → returns { total_session, visits[], ts }. visits is newest-first,
//                     capped at MAX_VISITS.
//
// Storage: module-scope ring buffer. Persists across requests on a warm Edge instance.
// Loses on cold start. For cross-restart persistence, swap STORAGE.* below to Vercel KV
// (one env var: VERCEL_KV_REST_API_URL).

export const config = { runtime: 'edge' };

const MAX_VISITS = 250;

// Lives across requests on the same warm Edge isolate.
// (Vercel keeps Edge instances warm for ~5–15 min of inactivity, longer under traffic.)
let VISITS = (globalThis.__BRB_VISITS__ ||= []);

function anonymizeIp(ip) {
  if (!ip) return null;
  if (ip.includes(':')) return ip.split(':').slice(0, 4).join(':') + '::';
  return ip.split('.').slice(0, 2).join('.') + '.x.x';
}

function readGeo(req, fallback) {
  const h = req.headers;
  const ip = h.get('x-real-ip') || (h.get('x-forwarded-for') || '').split(',')[0].trim() || null;
  const lat = parseFloat(h.get('x-vercel-ip-latitude')  || '');
  const lon = parseFloat(h.get('x-vercel-ip-longitude') || '');
  return {
    ip_anon: anonymizeIp(ip),
    country:  h.get('x-vercel-ip-country')         || fallback.country     || null,
    region:   h.get('x-vercel-ip-country-region')  || fallback.region      || null,
    city:     h.get('x-vercel-ip-city')            || fallback.city        || null,
    lat:      Number.isFinite(lat) ? lat : (fallback.lat ?? null),
    lon:      Number.isFinite(lon) ? lon : (fallback.lon ?? null),
  };
}

export default async function handler(req) {
  if (req.method === 'POST') {
    let body = {};
    try { body = await req.json(); } catch {}

    const geo = readGeo(req, body || {});
    const ua  = (req.headers.get('user-agent') || '').slice(0, 120);
    const ref = req.headers.get('referer') || null;

    const visit = {
      ts: Date.now(),
      path: (body && typeof body.path === 'string') ? body.path.slice(0, 80) : null,
      ua_brief: ua.replace(/[\(\)]/g, '').slice(0, 80),
      referer:  ref ? ref.slice(0, 120) : null,
      ...geo,
    };

    // Drop entries with no geo at all — they'd be useless on the map and noisy in the log.
    if (visit.lat == null && visit.lon == null && !visit.country) {
      return new Response(JSON.stringify({ ok: false, reason: 'no_geo' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    VISITS.unshift(visit);
    if (VISITS.length > MAX_VISITS) VISITS.length = MAX_VISITS;

    return new Response(JSON.stringify({ ok: true, count: VISITS.length, visit }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (req.method === 'GET') {
    // Build a country roll-up from the real log
    const byCountry = {};
    for (const v of VISITS) {
      if (!v.country) continue;
      byCountry[v.country] = (byCountry[v.country] || 0) + 1;
    }
    const topCountries = Object.entries(byCountry)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([code, n]) => ({ code, count: n }));

    return new Response(JSON.stringify({
      ts: Date.now(),
      total_session: VISITS.length,
      max: MAX_VISITS,
      top_countries: topCountries,
      visits: VISITS,
    }, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  return new Response('Method not allowed', { status: 405 });
}
