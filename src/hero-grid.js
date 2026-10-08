// Calm-water square-grid backdrop for the hero.
//
// Concept inspired by https://github.com/NayanVangala/rein (flickering-grid)
// — clean-room vanilla JS implementation written for this site; no code
// copied.
//
// Resting state: every square sits at one uniform color and opacity —
// perfectly calm water. On load, squares fade in with staggered randomized
// delays and settle. Moving the pointer (or touching) disturbs the surface:
// ripples emanate from each touch point as decaying traveling waves. Each
// square's opacity (plus a slight scale pulse) follows
//   base + AMP · sin(k·d − speed·age) · e^(−d/spatial) · e^(−age/tau)
// summed over all active ripples. Ripples die out and the grid eases back
// to calm. DPR-aware; the rAF loop runs only while animating and while the
// hero is visible; one static frame under prefers-reduced-motion.

// One uniform vibrant blue for every decorative square (#2E4BFF).
// (Brand elements elsewhere — buttons, headline accent, links — stay
// in vibrant brand blue #0d45d2.)
const BLUE = '46,75,255';
const REST_OPACITY = 0.10; // uniform resting opacity for every square
const CELL = 5; // square size, CSS px
const GAP = 7; // gap between squares, CSS px

// Load fade-in: each square waits a random delay, then eases to rest.
const FADE_SPREAD = 1.0; // max random delay, seconds
const FADE_DUR = 0.7; // per-square fade duration, seconds

// Ripple model parameters.
const RIPPLE_AMP = 0.55; // peak added opacity at a wave crest
const RIPPLE_K = (Math.PI * 2) / 90; // spatial frequency: 90px wavelength
const RIPPLE_SPEED = 260; // px/s, outward travel speed
const RIPPLE_SPATIAL = 220; // px, exponential decay length from origin
const RIPPLE_TAU = 0.9; // s, exponential time constant
const RIPPLE_LIFE = 1.8; // s, retire ripples older than this
const RIPPLE_MAX = 8; // cap on concurrent ripples
const SPAWN_GAP = 0.07; // s, min interval between pointermove spawns
const SPAWN_DIST = 24; // px, min distance from the previous spawn
const SCALE_PULSE = 0.45; // fractional size change at a full crest
const MAX_DRAW_OPACITY = 0.92; // clamp so overlapping crests stay textured

export function initHeroGrid() {
  const layer = document.getElementById('layerHero');
  if (!layer) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.createElement('canvas');
  canvas.className = 'hero-grid';
  canvas.setAttribute('aria-hidden', 'true');
  layer.prepend(canvas);
  const ctx = canvas.getContext('2d');

  const step = CELL + GAP;
  const t0 = performance.now() / 1000;
  let cols = 0;
  let rows = 0;
  let n = 0;
  let cx = new Float32Array(0); // cell centers, CSS px (rebuilt on resize)
  let cy = new Float32Array(0);
  let base = new Float32Array(0); // fade-in value per square (→ REST_OPACITY)
  let delays = new Float32Array(0); // per-square fade-in delay, seconds
  let wave = new Float32Array(0); // per-frame ripple accumulator
  let fadeDone = false;
  const ripples = []; // {t0, dist: Float32Array, spatial: Float32Array}
  let raf = 0;
  let slowTimer = 0;
  let inView = true;
  let lastSpawnT = -10;
  let lastSpawnX = 0;
  let lastSpawnY = 0;

  function build(animateIn) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = layer.clientWidth;
    const h = layer.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(w / step);
    rows = Math.ceil(h / step);
    n = cols * rows;
    cx = new Float32Array(n);
    cy = new Float32Array(n);
    base = new Float32Array(n);
    delays = new Float32Array(n);
    wave = new Float32Array(n);
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++, i++) {
        cx[i] = c * step + CELL / 2;
        cy[i] = r * step + CELL / 2;
        delays[i] = Math.random() * FADE_SPREAD;
        base[i] = animateIn ? 0 : REST_OPACITY;
      }
    }
    ripples.length = 0;
    fadeDone = !animateIn;
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
    if (ripples.length >= RIPPLE_MAX) ripples.shift();
    const dist = new Float32Array(n);
    const spatial = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const dx = cx[i] - x;
      const dy = cy[i] - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      dist[i] = d;
      spatial[i] = Math.exp(-d / RIPPLE_SPATIAL);
    }
    ripples.push({ t0: t, dist, spatial });
  }

  function layerPos(e) {
    const rect = layer.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onMove(e) {
    if (reduced || !inView || !heroActive()) return;
    const t = performance.now() / 1000 - t0;
    if (t - lastSpawnT < SPAWN_GAP) return;
    const p = layerPos(e);
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
    if (reduced || !inView || !heroActive()) return;
    const t = performance.now() / 1000 - t0;
    const p = layerPos(e);
    lastSpawnT = t;
    lastSpawnX = p.x;
    lastSpawnY = p.y;
    spawn(p.x, p.y, t);
    kick();
  }

  function draw(t) {
    const w = layer.clientWidth;
    const h = layer.clientHeight;
    ctx.clearRect(0, 0, w, h);
    wave.fill(0);
    for (let ri = ripples.length - 1; ri >= 0; ri--) {
      const rp = ripples[ri];
      const age = t - rp.t0;
      if (age > RIPPLE_LIFE) {
        ripples.splice(ri, 1);
        continue;
      }
      let tf = RIPPLE_AMP * Math.exp(-age / RIPPLE_TAU);
      // Ease the tail to zero so retiring a ripple is pop-free.
      const tail = RIPPLE_LIFE - age;
      if (tail < 0.3) tf *= tail / 0.3;
      if (tf < 0.004) {
        ripples.splice(ri, 1);
        continue;
      }
      const phase = RIPPLE_SPEED * age;
      const dist = rp.dist;
      const spatial = rp.spatial;
      for (let i = 0; i < n; i++) {
        wave[i] += tf * spatial[i] * Math.sin(RIPPLE_K * dist[i] - phase);
      }
    }
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++, i++) {
        let o = base[i] + wave[i];
        if (o < 0.004) continue;
        if (o > MAX_DRAW_OPACITY) o = MAX_DRAW_OPACITY;
        const wv = wave[i] / RIPPLE_AMP;
        const s = CELL * (1 + SCALE_PULSE * (wv < -1 ? -1 : wv > 1 ? 1 : wv));
        const off = (CELL - s) / 2;
        ctx.fillStyle = `rgba(${BLUE},${o.toFixed(3)})`;
        ctx.fillRect(c * step + off, r * step + off, s, s);
      }
    }
  }

  function tick() {
    raf = 0;
    if (!inView) return;
    if (!heroActive()) {
      // Cinematic has the hero faded: poll slowly instead of burning frames.
      slowTimer = window.setTimeout(slowPoll, 500);
      return;
    }
    const t = performance.now() / 1000 - t0;
    if (!fadeDone) {
      let done = true;
      for (let i = 0; i < n; i++) {
        if (base[i] >= REST_OPACITY) continue;
        const p = (t - delays[i]) / FADE_DUR;
        if (p >= 1) {
          base[i] = REST_OPACITY;
        } else {
          done = false;
          if (p > 0) base[i] = REST_OPACITY * (1 - Math.pow(1 - p, 3));
        }
      }
      fadeDone = done;
    }
    draw(t);
    if (!fadeDone || ripples.length > 0) {
      raf = requestAnimationFrame(tick);
    }
    // Otherwise settled: the calm frame stays, the loop stops.
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
    if (heroActive()) raf = requestAnimationFrame(tick);
    else slowTimer = window.setTimeout(slowPoll, 500);
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
          // Resume if there is anything left to animate.
          if (!fadeDone || ripples.length > 0) kick();
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
        build(false); // settle straight to calm; no replay of the fade-in
        draw(performance.now() / 1000 - t0);
      }, 120);
    },
    { passive: true },
  );

  build(!reduced);
  draw(performance.now() / 1000 - t0); // one frame immediately (empty unless reduced)
  if (!reduced) {
    layer.addEventListener('pointermove', onMove, { passive: true });
    layer.addEventListener('pointerdown', onDown, { passive: true });
    if (inView) raf = requestAnimationFrame(tick);
  }
}
