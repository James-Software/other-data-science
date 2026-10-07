# Acalanes Data Fest 2026

Landing page for the Acalanes Data Science Club hackathon: a light,
minimalist, typography-led design — off-white background, near-black text,
black pill buttons.

Instagram [@aca.datasci.club](https://instagram.com/aca.datasci.club) is the
signup path; event date, location, and registration are TBD.

## Develop

```bash
npm install
npm run dev      # local dev server with hot reload
npm run build    # production build into dist/
npm run preview  # preview the production build
```

Project layout:

- `index.html` — Vite entry at the repo root
- `src/main.js` — entry module (imports CSS and nav/reveal logic)
- `src/menu.js` — mobile nav + scroll-reveal
- `src/style.css` — all styles
- `public/` — static assets served as-is (`favicon.svg`)

## Deploy (Vercel)

Vercel auto-detects Vite: **Build Command** `vite build` (or `npm run
build`), **Output Directory** `dist`. No extra settings needed — connect the
repo and deploy.
