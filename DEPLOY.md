# Deploy bigredbutton.app to Vercel

You already bought the domain through Vercel. Two ways to deploy:

## Option A — Vercel CLI (fastest, ~2 minutes)

From your terminal:

```bash
cd path/to/this/landing/folder
npm i -g vercel        # if you don't already have it
vercel login           # one-time, picks up your existing account
vercel --prod          # deploys; first time it asks "link to existing project?"
                       #   choose "yes" → existing project bigredbutton.app
```

Vercel auto-detects this is a static site (no framework) and serves it as-is.

## Option B — Vercel Dashboard (drag-drop)

1. Open <https://vercel.com/dashboard>
2. Click **Add New ▸ Project**
3. Drag the entire `landing/` folder into the upload area, OR import from a GitHub repo
4. Framework preset: **Other**
5. Output directory: `./` (root)
6. Click **Deploy**
7. After deploy succeeds, go to **Settings ▸ Domains** and assign `bigredbutton.app` to the new project

## Files in this folder

- `index.html` — the landing page
- `vercel.json` — caching and security headers
- `demo.mp4` — MINIME_HACKATHON_DEMO_v18 (the submission film, 60s, 2.2MB)
- `listing.mp4` — NOS_listing_v2 (the actual generated output, 30s, 9.4MB)
- `avatar.mp4` — AI-Roger talking head sample (2.5MB)
- `hero1.png` — coastal property hero shot (gen4_image_turbo output)
- `hero2.png` — kitchen morning hero shot (gen4_image_turbo output)

Total: ~16MB. Vercel free tier covers this easily.

## After deploy

Once `bigredbutton.app` resolves, copy the URL and paste it into the Runway hackathon submission form at <https://runwayml.com/api-hackathon> along with the description.
