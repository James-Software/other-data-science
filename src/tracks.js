// Tracks section pixel-art animation — original work in a retro
// pixel-art spirit.
//
// One canvas animation on a fixed 64x64 pixel grid, scaled up with
// image-rendering: pixelated for crisp pixels. Palette: the site's one
// blue (#2E4BFF) plus near-black on white.
//
// - Best Overall: bobbing pixel trophy on a 1-2-3 podium, twinkling sparkles.
//
// One shared rAF loop; the canvas animates only while visible
// (IntersectionObserver). Under prefers-reduced-motion we paint one
// static frame and never start the loop. Without JS the card still
// shows its name plus a plain fallback glyph.

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

// ---- wiring ----

const DRAW = {
  overall: { draw: drawOverall, still: 1.0 },
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
