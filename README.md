# Acalanes Data Fest 2026

Ultra-minimal landing page for the Acalanes Data Science Club hackathon:
a single centered viewport — light nav, giant Poppins headline
("Acalanes Data Fest 2026", "2026" in school blue), one subline, one meta
line, one blue "Follow for updates" button, and a slim footer.

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
- `src/main.js` — entry module (imports CSS)
- `src/style.css` — all styles
- `public/` — static assets served as-is (`favicon.svg`, blue "A" on white)

## Deploy (Vercel)

Vercel auto-detects Vite: **Build Command** `vite build` (or `npm run
build`), **Output Directory** `dist`. No extra settings needed — connect the
repo and deploy.
