// Dithered wave pixel backdrop for the hero.
//
// A live Bayer-dithered wave field: two slow traveling waves plus a
// ripple ring that always emanates from the pointer, dithered into three
// levels of one blue (#2E4BFF) over the white page.
//
// Touching the field (pointer move / press) spawns extra decaying ripple
// rings on top of the ambient waves. Resolution-independent: the canvas
// runs at dither-cell resolution and is upscaled with
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

// Touch-ripple rings, evaluated in the same value domain as the waves.
const R_AMP = 0.55; // peak value added at a wave crest
const R_WAVELENGTH = 18; // cells (90px)
const R_SPEED = 52; // cells/s outward (260px/s)
const R_SPATIAL = 36; // cells, exponential decay length (180px)
const R_TAU = 0.9; // s, exponential time constant
const R_LIFE = 1.8; // s, retire ripples older than this
const R_MAX = 6; // cap on concurrent ripples
const R_CUT = 130; // cells, beyond this the contribution is ~0
const SPAWN_GAP = 0.09; // s, min interval between pointermove spawns
const SPAWN_DIST = 5; // cells, min distance from the previous spawn

const FRAME_MS = 40; // ~25fps is plenty for 5px cells

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
  let img = null;
  let wave = new Float32Array(0); // per-frame touch-ripple accumulator
  const pointer = { x: 0, y: 0, init: false }; // in cells
  const ripples = []; // {t0, ox, oy} in cells
  let lastSpawnT = -10;
  let lastSpawnX = 0;
  let lastSpawnY = 0;
  let raf = 0;
  let slowTimer = 0;
  let lastFrame = 0;
  let inView = true;

  function resize() {
    const w = layer.clientWidth;
    const h = layer.clientHeight;
    cols = Math.max(8, Math.ceil(w / CELL));
    rows = Math.max(8, Math.ceil(h / CELL));
    n = cols * rows;
    canvas.width = cols;
    canvas.height = rows;
    img = ctx.createImageData(cols, rows);
    wave = new Float32Array(n);
    if (!pointer.init) {
      pointer.x = cols * 0.6;
      pointer.y = rows * 0.4;
      pointer.init = true;
    }
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

  function spawn(x, y, t) {
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
    const p = layerCell(e);
    pointer.x = p.x;
    pointer.y = p.y;
    if (reduced || !inView || !heroActive()) return;
    const t = performance.now() / 1000 - t0;
    if (t - lastSpawnT < SPAWN_GAP) return;
    const dx = p.x - lastSpawnX;
    const dy = p.y - lastSpawnY;
    if (dx * dx + dy * dy < SPAWN_DIST * SPAWN_DIST) return;
    lastSpawnT = t;
    lastSpawnX = p.x;
    lastSpawnY = p.y;
    spawn(p.x, p.y, t);
    kick();
  }

  function onDown(e) {
    const p = layerCell(e);
    pointer.x = p.x;
    pointer.y = p.y;
    if (reduced || !inView || !heroActive()) return;
    const t = performance.now() / 1000 - t0;
    lastSpawnT = t;
    lastSpawnX = p.x;
    lastSpawnY = p.y;
    spawn(p.x, p.y, t);
    kick();
  }

  // Ambient wave field: two slow traveling waves plus a ripple ring that
  // always emanates from the pointer. x, y, and the pointer distance are
  // in dither cells.
  function baseValue(x, y, t) {
    const dx = x - pointer.x;
    const dy = y - pointer.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    return (
      0.46 +
      0.22 * Math.sin(x * 0.05 + t * 0.9) * Math.cos(y * 0.07 - t * 0.6) +
      0.18 * Math.sin((x * 0.6 + y) * 0.04 + t * 0.5) +
      0.38 * Math.sin(d * 0.4 - t * 3.2) * Math.exp(-d * 0.035)
    );
  }

  function draw(t) {
    const data = img.data;
    wave.fill(0);
    // Layer touch ripples into the accumulator (bounding-box walk so we
    // never iterate the whole grid per ripple).
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
      for (let x = 0; x < cols; x++) {
        const v = baseValue(x, y, t) + wave[rowOff + x];
        const thr = (BAYER[(y & 7) * 8 + (x & 7)] + 0.5) / 64;
        if (v > thr + 0.4) {
          data[p] = BLUE_R;
          data[p + 1] = BLUE_G;
          data[p + 2] = BLUE_B;
          data[p + 3] = 255;
        } else if (v > thr) {
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
      draw(now / 1000 - t0);
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
