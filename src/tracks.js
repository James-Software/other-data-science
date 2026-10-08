// Tracks section pixel-art animations — original work in a retro
// pixel-art spirit.
//
// Three canvas animations on a fixed 64x64 pixel grid, scaled up with
// image-rendering: pixelated for crisp pixels. Palette: the site's one
// blue (#2E4BFF) plus near-black on white.
//
// - Best Overall: bobbing pixel trophy on a 1-2-3 podium, twinkling sparkles.
// - Most Impactful: beating pixel heart with expanding ripple rings.
// - Best Finance: bars growing in sequence, then a flipping coin.
//
// One shared rAF loop; a canvas animates only while visible
// (IntersectionObserver). Under prefers-reduced-motion we paint one
// static frame per canvas and never start the loop. Without JS the
// cards still show their names plus a plain fallback glyph.

const BLUE = '#2E4BFF';
const INK = '#111111';
const WHITE = '#ffffff';
const W = 64;
const H = 64;

function prep(canvas) {
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d');
  c.imageSmoothingEnabled = false;
  return c;
}

function rect(c, x, y, w, h, col) {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), w, h);
}

function clear(c) {
  c.fillStyle = WHITE;
  c.fillRect(0, 0, W, H);
}

// 3x5 pixel digits for the podium places.
const DIGITS = {
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
};

function digit(c, d, x, y, col) {
  const g = DIGITS[d];
  for (let r = 0; r < 5; r++)
    for (let q = 0; q < 3; q++)
      if (g[r][q] === '1') rect(c, x + q, y + r, 1, 1, col);
}

// Four-point sparkle.
function sparkle(c, x, y, s, col) {
  rect(c, x - s, y, s * 2 + 1, 1, col);
  rect(c, x, y - s, 1, s * 2 + 1, col);
}

// ---- Best Overall: trophy on a 1-2-3 podium ----

function trophy(c, cx, topY) {
  // cup
  rect(c, cx - 6, topY, 12, 8, BLUE);
  rect(c, cx - 6, topY, 12, 1, INK); // rim
  // handles
  rect(c, cx - 9, topY + 1, 3, 2, BLUE);
  rect(c, cx - 9, topY + 3, 2, 3, BLUE);
  rect(c, cx + 6, topY + 1, 3, 2, BLUE);
  rect(c, cx + 7, topY + 3, 2, 3, BLUE);
  // stem + base
  rect(c, cx - 1, topY + 8, 2, 4, BLUE);
  rect(c, cx - 4, topY + 12, 8, 2, BLUE);
  rect(c, cx - 4, topY + 12, 8, 1, INK);
}

function drawOverall(c, t) {
  clear(c);
  const q = Math.floor(t * 10); // quantized clock: sprite feel
  // podium steps: [x, height, place]
  const steps = [
    [8, 10, 3],
    [25, 18, 1],
    [42, 14, 2],
  ];
  for (const [x, h, place] of steps) {
    const y = 56 - h;
    rect(c, x, y, 14, h, BLUE);
    rect(c, x, y, 14, 1, INK);
    digit(c, place, x + 5, y + Math.floor((h - 5) / 2), WHITE);
  }
  // trophy hovers and bobs above the 1st-place step
  const bob = Math.round(Math.sin((t * Math.PI * 2) / 2.4) * 2);
  trophy(c, 32, 20 + bob);
  // twinkling sparkles
  const spots = [
    [8, 10],
    [54, 8],
    [55, 32],
    [9, 33],
    [19, 25],
    [46, 24],
  ];
  spots.forEach(([x, y], i) => {
    const m = (q + i * 2) % 4;
    if (m === 0) sparkle(c, x, y, 2, BLUE);
    else if (m === 2) sparkle(c, x, y, 1, BLUE);
  });
}

// ---- Most Impactful: beating heart, radiating ripples ----

const HEART = [
  '..XXXX..XXXX..',
  '.XXXXXXXXXXXX.',
  'XXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXX',
  '.XXXXXXXXXXXX.',
  '..XXXXXXXXXX..',
  '...XXXXXXXX...',
  '....XXXXXX....',
  '.....XXXX.....',
  '......XX......',
];
const HEART_W = 14;
const HEART_H = 11;

let heartSprite = null;
function getHeart() {
  if (heartSprite) return heartSprite;
  const s = document.createElement('canvas');
  s.width = HEART_W;
  s.height = HEART_H;
  const sc = s.getContext('2d');
  for (let r = 0; r < HEART_H; r++)
    for (let q = 0; q < HEART_W; q++)
      if (HEART[r][q] === 'X') {
        sc.fillStyle = BLUE;
        sc.fillRect(q, r, 1, 1);
      }
  heartSprite = s;
  return s;
}

// Diamond (manhattan-distance) ring outline — reads as a pixel ripple.
function diamond(c, cx, cy, r, col) {
  const rr = Math.round(r);
  if (rr <= 0) return;
  for (let dx = -rr; dx <= rr; dx++) {
    const dy = rr - Math.abs(dx);
    const x = Math.round(cx + dx);
    const y1 = Math.round(cy - dy);
    const y2 = Math.round(cy + dy);
    if (x < 0 || x >= W) continue;
    if (y1 >= 0 && y1 < H) rect(c, x, y1, 1, 1, col);
    if (dy !== 0 && y2 >= 0 && y2 < H) rect(c, x, y2, 1, 1, col);
  }
}

function drawImpact(c, t) {
  clear(c);
  const cx = 32;
  const cy = 30;
  // heartbeat: lub-dub every 1.6s
  const ph = (t % 1.6) / 1.6;
  const gauss = (x, m, s) => Math.exp(-((x - m) * (x - m)) / (2 * s * s));
  const beat = gauss(ph, 0.12, 0.06) + 0.7 * gauss(ph, 0.34, 0.06);
  const scale = 2.4 * (1 + 0.16 * Math.min(1, beat));
  const bob = Math.round(Math.sin((t * Math.PI * 2) / 1.6) * 1);
  // expanding ripple rings, staggered
  for (let k = 0; k < 3; k++) {
    const r = ((t * 13 + k * 11) % 33) + 2;
    const a = Math.max(0, 0.55 * (1 - r / 35));
    if (a > 0.02) diamond(c, cx, cy, r, `rgba(46,75,255,${a.toFixed(2)})`);
  }
  // heart, scaled crisply from the 1px sprite
  const sprite = getHeart();
  const dw = HEART_W * scale;
  const dh = HEART_H * scale;
  c.drawImage(sprite, cx - dw / 2, cy - dh / 2 + bob, dw, dh);
  // rising sparkles
  const spots = [14, 24, 40, 50];
  spots.forEach((x, i) => {
    const yy = 58 - ((t * 9 + i * 17) % 52);
    if ((Math.floor(t * 6) + i) % 2 === 0) sparkle(c, x, Math.round(yy), 1, BLUE);
  });
}

// ---- Best Finance: growing bars, flipping coin ----

function disc(c, cx, cy, r, col, edgeCol) {
  const inner = (r - 1.5) * (r - 1.5);
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++) {
      const d = x * x + y * y;
      if (d <= r * r) rect(c, cx + x, cy + y, 1, 1, d > inner ? edgeCol : col);
    }
}

function drawFinance(c, t) {
  clear(c);
  const cycle = 4.4;
  const tt = t % cycle;
  // baseline
  rect(c, 8, 54, 48, 1, INK);
  // bars grow in sequence, in chunky 4px steps
  const targets = [14, 24, 18, 32];
  const xs = [12, 24, 36, 48];
  targets.forEach((th, i) => {
    const p = Math.min(1, Math.max(0, (tt - i * 0.5) / 0.7));
    const h = Math.ceil((th * p) / 4) * 4;
    if (h > 0) rect(c, xs[i], 54 - h, 8, h, BLUE);
  });
  // coin pops up over the tallest bar and flips
  if (tt > 2.2 && tt < 3.8) {
    const ct = tt - 2.2;
    const rise = Math.min(1, ct / 0.4);
    const cx = 52;
    const cy = Math.round(22 - 10 * rise);
    if (Math.floor(ct * 9) % 2 === 0) {
      disc(c, cx, cy, 6, BLUE, INK);
      rect(c, cx - 1, cy - 2, 3, 5, WHITE); // shine
    } else {
      // edge-on frame of the flip
      rect(c, cx - 1, cy - 6, 3, 13, BLUE);
      rect(c, cx - 1, cy - 6, 3, 1, INK);
      rect(c, cx - 1, cy + 6, 3, 1, INK);
    }
  }
}

// ---- wiring ----

const DRAW = {
  overall: { draw: drawOverall, still: 1.0 },
  impact: { draw: drawImpact, still: 0.8 },
  finance: { draw: drawFinance, still: 2.8 },
};

export function initTracks() {
  const section = document.querySelector('.tracks');
  const canvases = [...document.querySelectorAll('.track-canvas')];
  if (!section || !canvases.length) return;
  section.classList.add('tracks-js');

  const anims = new Map();
  for (const cv of canvases) {
    const entry = DRAW[cv.dataset.track];
    if (!entry) continue;
    anims.set(cv, { ctx: prep(cv), draw: entry.draw, still: entry.still });
  }
  if (!anims.size) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    anims.forEach((a) => a.draw(a.ctx, a.still));
    return;
  }

  const live = new Set();
  let raf = 0;
  const tick = () => {
    raf = 0;
    const t = performance.now() / 1000;
    live.forEach((a) => a.draw(a.ctx, t));
    if (live.size) raf = requestAnimationFrame(tick);
  };
  const kick = () => {
    if (!raf && live.size) raf = requestAnimationFrame(tick);
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const a = anims.get(e.target);
        if (!a) continue;
        if (e.isIntersecting) live.add(a);
        else live.delete(a);
      }
      kick();
    },
    { threshold: 0.2 },
  );
  anims.forEach((_, cv) => io.observe(cv));
}
