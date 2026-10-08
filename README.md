# Acalanes Data Fest 2026

Ultra-minimal landing page for the Acalanes Data Science Club hackathon:
a single centered viewport — light nav, giant Poppins headline
("Acalanes Data Fest 2026", "2026" in school blue), one subline, one meta
line, one blue "Follow for updates" button, a scroll-driven cinematic, and
a slim footer.

Between the hero and the FAQ, scrolling drives a pinned cinematic
(~600vh): blue squares fill the screen, then "The Bay Area has always been
the center of technology." appears, then a 3D California hologram, then
everything fades back to white and "Acalanes Data Fest gathers
California's brightest young innovators in one place." appears before the
page continues. `prefers-reduced-motion` (or no JS) skips the pinning and
shows a static hero + final text.

Instagram [@aca.datasci.club](https://instagram.com/aca.datasci.club) is the
only signup path; event date, location, and registration are TBD.

## Develop

```bash
npm install
npm run dev      # local dev server with hot reload
npm run build    # production build into dist/
npm run preview  # preview the production build
```

Project layout:

- `index.html` — Vite entry at the repo root
- `src/main.js` — entry module (imports CSS, starts the cinematic)
- `src/cinematic.js` — scroll-progress → phase mapping + canvas squares
- `src/cinematic.css` — pin/stage/layer styles + hologram keyframes
- `src/style.css` — all styles
- `public/` — static assets served as-is (`favicon.svg`, blue "A" on white)

## Deploy (Vercel)

Vercel auto-detects Vite: **Build Command** `vite build` (or `npm run
build`), **Output Directory** `dist`. No extra settings needed — connect the
repo and deploy.
