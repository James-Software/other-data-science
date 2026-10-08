// Cascade pixel field for the hero.
//
// Blue pixels spawn near the top of the hero and advect down and outward
// like a slow cascade, rendered through an ordered Bayer dither in one
// blue (#2E4BFF) over the white page. A density mask keeps the center
// mostly white — the flow lives on the left and right sides — with a
// whisper of pixels drifting through the middle so it never looks cut
// out.
//
// Touching the field (pointer move / press) spawns a few soft, quickly
// decaying ripple rings on top of the flow. Resolution-independent: the
// canvas runs at dither-cell resolution and is upscaled with
// image-rendering: pixelated. The rAF loop runs only while the hero is
// visible; one static frame under prefers-reduced-motion.

const CELL = 5; // dither cell size, CSS px
const BLUE_R = 46;
const BLUE_G = 75;
const BLUE_B = 255; // #2E4BFF — the only hue ever drawn
const MID_ALPHA = 115; // mid dither level opacity (~45%), same hue

// Standard 8x8 Bayer ordered-dither threshold matrix.
const BAYER = [
   0, 32,  8, 40,  2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44,  4, 36, 14, 46,  6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
   3, 35, 11, 43,  1, 33,  9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47,  7, 39, 13, 45,  5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
];

// Soft touch ripples, evaluated in the same value domain as the field.
// Deliberately gentle: few concurrent rings, low amplitude, fast decay.
const R_AMP = 0.26; // peak value added at a wave crest
const R_WAVELENGTH = 22; // cells
const R_SPEED = 40; // cells/s outward
const R_SPATIAL = 24; // cells, exponential decay length
const R_TAU = 0.55; // s, exponential time constant
const R_LIFE = 1.3; // s, retire ripples older than this
const R_MAX = 3; // cap on concurrent ripples
const R_CUT = 90; // cells, beyond this the contribution is ~0
const SPAWN_GAP = 0.4; // s, min interval between pointermove spawns
const SPAWN_DIST = 12; // cells, min distance from the previous spawn

const FRAME_MS = 40; // ~25fps is plenty for 5px cells
const STEP = FRAME_MS / 1000;

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function initHeroGrid() {
  const layer = document.getElementById('layerHero');
  if (!layer) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.createElement('canvas');
  canvas.className = 'hero-grid';
  canvas.setAttribute('aria-hidden', 'true');
  if (!reduced) canvas.style.opacity = '0';
  layer.prepend(canvas);
  const ctx = canvas.getContext('2d');

  const t0 = performance.now() / 1000;
  let cols = 0;
  let rows = 0;
  let n = 0;
  let cx = 0; // horizontal center, in cells
  let img = null;
  let acc = new Float32Array(0); // per-cell splatted pixel density
  let wave = new Float32Array(0); // per-frame touch-ripple accumulator
  let parts = []; // cascade particles: {x, y, vy, seed, age} in cells
  const ripples = []; // {t0, ox, oy} in cells
  let lastSpawnT = -10;
  let lastSpawnX = 0;
  let lastSpawnY = 0;
  let raf = 0;
  let slowTimer = 0;
  let lastFrame = 0;
  let inView = true;

  // Density mask: ~0.05 at the horizontal center, ~1.0 at the sides.
  // u is 0 at center, 1 at the left/right edges.
  function sideMask(u) {
    return 0.05 + 0.95 * smoothstep(0.12, 0.7, u);
  }

  function spawn(p) {
    // Rejection-sample x so the sides stay dense and the center keeps
    // only a whisper of pixels.
    let x = Math.random() * cols;
    for (let k = 0; k < 8; k++) {
      const cand = Math.random() * cols;
      const u = Math.abs(cand - cx) / (cols / 2);
      if (Math.random() < sideMask(u)) {
        x = cand;
        break;
      }
      x = cand;
    }
    p.x = x;
    p.y = -4 - Math.random() * rows * 0.12; // just above / at the top
    p.vy = 13 + Math.random() * 9; // cells/s downward
    p.seed = Math.random();
    p.age = 0;
  }

  function buildField() {
    const count = Math.max(600, Math.min(2800, Math.round((cols * rows) / 22)));
    parts = [];
    for (let i = 0; i < count; i++) {
      const p = {};
      spawn(p);
      parts.push(p);
    }
  }

  // Advance the cascade: mostly downward, with an outward horizontal
  // component that grows away from the center, plus a touch of wobble.
  function advance(dt, t) {
    const half = cols / 2;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const u = Math.min(1.2, Math.abs(p.x - cx) / half);
      const dir = p.x >= cx ? 1 : -1;
      const vx =
        dir * (3 + 13 * u) + 2.5 * Math.sin(t * 1.2 + p.seed * 6.283 + p.y * 0.045);
      const vy = p.vy * (0.9 + 0.2 * Math.sin(p.seed * 6.283 + t * 0.8));
      p.x += vx * dt;
      p.y += vy * dt;
      p.age += dt;
      if (p.y > rows + 2 || p.x < -4 || p.x > cols + 4 || p.age > 16) {
        spawn(p);
      }
    }
  }

  function resize() {
    const w = layer.clientWidth;
    const h = layer.clientHeight;
    cols = Math.max(8, Math.ceil(w / CELL));
    rows = Math.max(8, Math.ceil(h / CELL));
    cx = cols / 2;
    n = cols * rows;
    canvas.width = cols;
    canvas.height = rows;
    img = ctx.createImageData(cols, rows);
    acc = new Float32Array(n);
    wave = new Float32Array(n);
    ripples.length = 0;
    buildField();
    // Pre-roll so the first paint already shows the cascade mid-flow.
    for (let k = 0; k < 70; k++) advance(STEP, k * STEP);
  }

  // The cinematic fades the hero layer out via inline opacity as the
  // scroll sequence takes over — treat a faded hero as inactive.
  function heroActive() {
    if (document.hidden) return false;
    const o = parseFloat(layer.style.opacity);
    if (!Number.isNaN(o) && o < 0.05) return false;
    const rect = layer.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  }

  function spawnRipple(x, y, t) {
    if (ripples.length >= R_MAX) ripples.shift();
    ripples.push({ t0: t, ox: x, oy: y });
  }

  function layerCell(e) {
    const rect = layer.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / CELL,
      y: (e.clientY - rect.top) / CELL,
    };
  }

  function onMove(e) {
    if (reduced || !inView || !heroActive()) return;
    const t = performance.now() / 1000 - t0;
    if (t - lastSpawnT < SPAWN_GAP) return;
    const p = layerCell(e);
    const dx = p.x - lastSpawnX;
    const dy = p.y - lastSpawnY;
    if (dx * dx + dy * dy < SPAWN_DIST * SPAWN_DIST) return;
    lastSpawnT = t;
    lastSpawnX = p.x;
    lastSpawnY = p.y;
    spawnRipple(p.x, p.y, t);
    kick();
  }

  function onDown(e) {
    if (reduced || !inView || !heroActive()) return;
    const t = performance.now() / 1000 - t0;
    const p = layerCell(e);
    lastSpawnT = t;
    lastSpawnX = p.x;
    lastSpawnY = p.y;
    spawnRipple(p.x, p.y, t);
    kick();
  }

  function draw(t) {
    const data = img.data;
    acc.fill(0);
    // Splat particles into the cell grid with per-particle fade.
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const ix = Math.floor(p.x);
      const iy = Math.floor(p.y);
      if (ix < 0 || iy < 0 || ix >= cols || iy >= rows) continue;
      const fadeIn = smoothstep(0, 0.6, p.age);
      const fadeOut = 1 - smoothstep(rows - 14, rows - 1, p.y);
      const a = 0.85 * fadeIn * fadeOut;
      if (a <= 0.01) continue;
      const idx = iy * cols + ix;
      const s = acc[idx] + a;
      acc[idx] = s > 1.15 ? 1.15 : s;
    }
    // Layer touch ripples into the accumulator (bounding-box walk so we
    // never iterate the whole grid per ripple).
    wave.fill(0);
    const RK = (Math.PI * 2) / R_WAVELENGTH;
    const cut2 = R_CUT * R_CUT;
    for (let ri = ripples.length - 1; ri >= 0; ri--) {
      const rp = ripples[ri];
      const age = t - rp.t0;
      if (age > R_LIFE) {
        ripples.splice(ri, 1);
        continue;
      }
      let tamp = R_AMP * Math.exp(-age / R_TAU);
      // Ease the tail to zero so retiring a ripple is pop-free.
      const tail = R_LIFE - age;
      if (tail < 0.3) tamp *= tail / 0.3;
      if (tamp < 0.004) {
        ripples.splice(ri, 1);
        continue;
      }
      const phase = R_SPEED * age;
      const c0 = Math.max(0, Math.floor(rp.ox - R_CUT));
      const c1 = Math.min(cols - 1, Math.ceil(rp.ox + R_CUT));
      const r0 = Math.max(0, Math.floor(rp.oy - R_CUT));
      const r1 = Math.min(rows - 1, Math.ceil(rp.oy + R_CUT));
      for (let y = r0; y <= r1; y++) {
        const rowOff = y * cols;
        const dy = y - rp.oy;
        for (let x = c0; x <= c1; x++) {
          const dx = x - rp.ox;
          const d2 = dx * dx + dy * dy;
          if (d2 > cut2) continue;
          const d = Math.sqrt(d2);
          wave[rowOff + x] +=
            tamp * Math.sin(RK * d - phase) * Math.exp(-d / R_SPATIAL);
        }
      }
    }
    // Dither the field into three levels of the one blue: transparent
    // (page white shows through), mid blue, full blue.
    let p = 0;
    for (let y = 0; y < rows; y++) {
      const rowOff = y * cols;
      const brow = (y & 7) * 8;
      for (let x = 0; x < cols; x++) {
        const v = acc[rowOff + x] + wave[rowOff + x];
        const thr = (BAYER[brow + (x & 7)] + 0.5) / 64;
        const t1 = thr * 0.55;
        const t2 = t1 + 0.45;
        if (v >= t2) {
          data[p] = BLUE_R;
          data[p + 1] = BLUE_G;
          data[p + 2] = BLUE_B;
          data[p + 3] = 255;
        } else if (v >= t1) {
          data[p] = BLUE_R;
          data[p + 1] = BLUE_G;
          data[p + 2] = BLUE_B;
          data[p + 3] = MID_ALPHA;
        } else {
          data[p + 3] = 0;
        }
        p += 4;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function tick(now) {
    raf = 0;
    if (!inView) return;
    if (!heroActive()) {
      // Cinematic has the hero faded: poll slowly instead of burning frames.
      slowTimer = window.setTimeout(slowPoll, 500);
      return;
    }
    if (now - lastFrame > FRAME_MS) {
      lastFrame = now;
      const t = now / 1000 - t0;
      advance(STEP, t);
      draw(t);
    }
    raf = requestAnimationFrame(tick);
  }

  function slowPoll() {
    slowTimer = 0;
    if (!inView) return;
    if (heroActive()) {
      if (!raf) raf = requestAnimationFrame(tick);
    } else {
      slowTimer = window.setTimeout(slowPoll, 500);
    }
  }

  function kick() {
    if (reduced || raf || slowTimer || !inView) return;
    if (heroActive()) {
      raf = requestAnimationFrame(tick);
    } else {
      slowTimer = window.setTimeout(slowPoll, 500);
    }
  }

  function cancel() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    if (slowTimer) {
      window.clearTimeout(slowTimer);
      slowTimer = 0;
    }
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => {
        inView = entries[0].isIntersecting;
        if (inView) {
          kick();
        } else {
          cancel();
        }
      },
      { threshold: 0 },
    ).observe(layer);
  }

  let resizeTimer = 0;
  window.addEventListener(
    'resize',
    () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resize();
        draw(performance.now() / 1000 - t0);
      }, 120);
    },
    { passive: true },
  );

  resize();
  if (reduced) {
    draw(0); // one static frame, no loop, no listeners
    return;
  }
  draw(0);
  layer.addEventListener('pointermove', onMove, { passive: true });
  layer.addEventListener('pointerdown', onDown, { passive: true });
  // Fade the field in once the first frame is painted.
  requestAnimationFrame(() => {
    canvas.style.opacity = '1';
  });
  if (inView) raf = requestAnimationFrame(tick);
}
