// Scroll cinematic for Acalanes Data Fest 2026.
//
// A ~700svh wrapper holds a sticky 100svh stage. Scroll progress p (0..1)
// maps deterministically to phases — no time-based motion in the phase
// logic; a rAF-throttled passive scroll listener re-renders on scroll only.
//
//   p 0.00-0.30  blue squares pop in until the stage is covered
//   p 0.30-0.45  white text: "The Bay Area has always been the center of technology."
//   p 0.45-0.65  3D California hologram (CSS idle animation, scroll-driven opacity)
//   p 0.65-0.80  text 1, hologram, and squares fade out back to white
//   p 0.80-1.00  final text, black on white with blue accent words
//
// prefers-reduced-motion (or no JS): the cinematic never enables and the
// page falls back to a static hero + final text in normal flow.

import './cinematic.css';

const BLUE = '#1b4996';

const clamp01 = (x) => Math.min(1, Math.max(0, x));

// smoothstep between a and b
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function initCinematic() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const pin = document.getElementById('pin');
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('squares');
  const hero = document.getElementById('layerHero');
  const text1 = document.getElementById('layerText1');
  const holo = document.getElementById('layerHolo');
  const final = document.getElementById('layerFinal');
  if (!pin || !stage || !canvas || !hero || !text1 || !holo || !final) return;

  document.documentElement.classList.add('has-cinematic');

  const ctx = canvas.getContext('2d');
  let cells = []; // {x, y, threshold} in CSS px, shuffled once
  let cellPx = 64;
  let pinTop = 0;
  let pinRange = 1;

  // Deterministic shuffle (mulberry32) so the pop-in order is stable
  // per load and identical across resizes.
  function buildGrid() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cellPx = Math.max(44, Math.min(76, Math.floor(Math.min(w, h) / 14)));
    const cols = Math.ceil(w / cellPx);
    const rows = Math.ceil(h / cellPx);
    cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push({ x: c * cellPx, y: r * cellPx, threshold: 0 });
      }
    }

    let seed = 0xc0ffee;
    const rand = () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = cells[i];
      cells[i] = cells[j];
      cells[j] = tmp;
    }
    const n = cells.length;
    cells.forEach((cell, i) => {
      // spread pop-in thresholds across phase A (0.02 -> 0.24, full by 0.29)
      cell.threshold = 0.02 + (i / Math.max(1, n - 1)) * 0.22;
    });

    pinTop = pin.getBoundingClientRect().top + window.scrollY;
    pinRange = Math.max(1, pin.offsetHeight - stage.clientHeight);
  }

  function progress() {
    return clamp01((window.scrollY - pinTop) / pinRange);
  }

  function drawSquares(p) {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const fade = 1 - smooth(0.68, 0.8, p); // phase D: squares dissolve
    if (fade <= 0 || p <= 0) return;
    const half = cellPx / 2;
    ctx.fillStyle = BLUE;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const local = smooth(cell.threshold, cell.threshold + 0.05, p);
      if (local <= 0) continue;
      const size = cellPx * (0.55 + 0.45 * local); // pop-in scale
      ctx.globalAlpha = local * fade;
      ctx.fillRect(cell.x + half - size / 2, cell.y + half - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  function setLayer(el, opacity, transform) {
    el.style.opacity = opacity.toFixed(3);
    if (transform !== undefined) el.style.transform = transform;
    el.style.visibility = opacity <= 0.001 ? 'hidden' : 'visible';
  }

  function render() {
    const p = progress();
    const vh = stage.clientHeight;

    // hero: out by p = 0.06 as the cinematic takes over
    const heroOut = smooth(0, 0.06, p);
    setLayer(hero, 1 - heroOut, `translateY(${(-28 * heroOut).toFixed(1)}px)`);

    drawSquares(p);

    // text 1: in 0.30-0.38, drifts up as the hologram arrives, out 0.66-0.74
    const t1in = smooth(0.3, 0.38, p);
    const t1out = smooth(0.66, 0.74, p);
    const t1rise = smooth(0.45, 0.55, p);
    setLayer(
      text1,
      t1in * (1 - t1out),
      `translateY(${(24 * (1 - t1in) - vh * 0.24 * t1rise).toFixed(1)}px)`,
    );

    // hologram: in 0.45-0.53, nudged below center, out 0.66-0.74
    const hIn = smooth(0.45, 0.53, p);
    const hOut = smooth(0.66, 0.74, p);
    setLayer(
      holo,
      hIn * (1 - hOut),
      `translateY(${(vh * 0.05 * hIn).toFixed(1)}px) scale(${(0.9 + 0.1 * hIn).toFixed(3)})`,
    );

    // final text: in 0.82-0.90, holds to the end of the pin
    const fIn = smooth(0.82, 0.9, p);
    setLayer(final, fIn, `translateY(${(28 * (1 - fIn)).toFixed(1)}px)`);
  }

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      render();
    });
  }

  let resizeTimer = 0;
  window.addEventListener(
    'resize',
    () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        buildGrid();
        render();
      }, 120);
    },
    { passive: true },
  );
  window.addEventListener('scroll', onScroll, { passive: true });

  buildGrid();
  render();
}
