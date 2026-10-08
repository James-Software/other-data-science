// Square-grid pixel backdrop for the hero.
//
// Concept inspired by https://github.com/NayanVangala/rein (flickering-grid)
// — clean-room vanilla JS implementation written for this site; no code
// copied.
//
// Ambient motion follows rein's flickering-grid model: every square holds
// its own opacity and, independently of the others, snaps to a new random
// opacity at a low stochastic rate (probability flickerChance * dt per
// frame) — a continuous gentle shimmer across the whole field, never a
// traveling wave. Moving the pointer (or touching) disturbs the field:
// ripples emanate from each touch point as decaying traveling waves that
// add on top of the ambient shimmer, then die out and the shimmer carries
// on underneath. One uniform blue for every square. DPR-aware; the rAF
// loop runs while the hero is visible; one static frame under
// prefers-reduced-motion.

// One uniform vibrant blue for every decorative square (#2E4BFF).
// (Brand elements elsewhere — buttons, headline accent, links — stay
// in vibrant brand blue #0d45d2.)
const BLUE = '46,75,255';
const CELL = 5; // square size, CSS px
const GAP = 7; // gap between squares, CSS px

// Ambient shimmer — rein's flickering-grid model: per-square stochastic
// opacity snaps, each square re-rolled independently.
const FLICKER_CHANCE = 0.3; // per-square, per-second re-roll probability
const MAX_OP = 0.3; // opacity ceiling (rein's maxOpacity)

// Load entrance: squares fade from 0 to their shimmer values, staggered.
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
  let shimmer = new Float32Array(0); // ambient opacity per square (rein model)
  let fade = new Float32Array(0); // load fade-in multiplier per square (→ 1)
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
  let lastT = t0;

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
    shimmer = new Float32Array(n);
    fade = new Float32Array(n);
    delays = new Float32Array(n);
    wave = new Float32Array(n);
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++, i++) {
        cx[i] = c * step + CELL / 2;
        cy[i] = r * step + CELL / 2;
        shimmer[i] = Math.random() * MAX_OP;
        delays[i] = Math.random() * FADE_SPREAD;
        fade[i] = animateIn ? 0 : 1;
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

  function draw(t, dt) {
    const w = layer.clientWidth;
    const h = layer.clientHeight;
    ctx.clearRect(0, 0, w, h);
    if (!fadeDone) {
      let done = true;
      for (let i = 0; i < n; i++) {
        if (fade[i] >= 1) continue;
        const p = (t - delays[i]) / FADE_DUR;
        if (p >= 1) {
          fade[i] = 1;
        } else {
          done = false;
          if (p > 0) fade[i] = 1 - Math.pow(1 - p, 3);
        }
      }
      fadeDone = done;
    }
    // Rein's ambient shimmer: each square independently re-rolls its
    // opacity with probability FLICKER_CHANCE * dt.
    if (!reduced && dt > 0) {
      const chance = FLICKER_CHANCE * dt;
      for (let i = 0; i < n; i++) {
        if (Math.random() < chance) shimmer[i] = Math.random() * MAX_OP;
      }
    }
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
        let o = shimmer[i] * fade[i] + wave[i];
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
    const dt = Math.min(0.1, Math.max(0, t - lastT));
    lastT = t;
    draw(t, dt);
    // Ambient shimmer never settles: keep the loop running while visible.
    raf = requestAnimationFrame(tick);
  }

  function slowPoll() {
    slowTimer = 0;
    if (!inView) return;
    if (heroActive()) {
      if (!raf) {
        lastT = performance.now() / 1000 - t0;
        raf = requestAnimationFrame(tick);
      }
    } else {
      slowTimer = window.setTimeout(slowPoll, 500);
    }
  }

  function kick() {
    if (reduced || raf || slowTimer || !inView) return;
    if (heroActive()) {
      lastT = performance.now() / 1000 - t0;
      raf = requestAnimationFrame(tick);
    } else slowTimer = window.setTimeout(slowPoll, 500);
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
          kick(); // ambient motion always has something to animate
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
        build(false); // re-roll the shimmer; no replay of the fade-in
        draw(performance.now() / 1000 - t0, 0);
      }, 120);
    },
    { passive: true },
  );

  build(!reduced);
  draw(performance.now() / 1000 - t0, 0); // one frame immediately
  if (!reduced) {
    layer.addEventListener('pointermove', onMove, { passive: true });
    layer.addEventListener('pointerdown', onDown, { passive: true });
    if (inView) raf = requestAnimationFrame(tick);
  }
}
