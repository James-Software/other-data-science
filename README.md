# Acalanes Data Fest

Landing page for the Acalanes Data Science Club hackathon: blue, black, and
white school theme with a 3D spinning Acalanes "A" hero (vanilla WebGL, zero
runtime dependencies).

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
- `src/main.js` — entry module (imports CSS, nav/reveal logic, coin)
- `src/menu.js` — mobile nav + scroll-reveal
- `src/coin.js` — 3D coin (plain WebGL)
- `src/style.css` — all styles
- `public/` — static assets served as-is (`favicon.svg`, `acalanes-a.png`)

## Deploy (Vercel)

Vercel auto-detects Vite: **Build Command** `vite build` (or `npm run
build`), **Output Directory** `dist`. No extra settings needed — connect the
repo and deploy.
