// Flickering square-grid backdrop for the hero.
//
// Concept inspired by https://github.com/NayanVangala/rein (flickering-grid)
// — clean-room vanilla JS implementation written for this site; no code
// copied. A canvas behind the hero shows a sparse grid of tiny school-blue
// squares whose opacities randomly retarget and ease toward their targets,
// giving a subtle ambient twinkle. DPR-aware; the rAF loop pauses when the
// hero is off-screen or faded out by the cinematic, and renders one static
// frame under prefers-reduced-motion.

const BLUE_RGB = '27, 73, 150'; // school blue #1b4996
const MAX_OPACITY = 0.12;
const CELL = 5; // square size, CSS px
const GAP = 7; // gap between squares, CSS px
const FLICKER_CHANCE = 0.03; // per-cell, per-frame retarget probability
const EASE = 0.08; // easing toward target opacity per frame

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
  let cols = 0;
  let rows = 0;
  let opacities = new Float32Array(0);
  let targets = new Float32Array(0);
  let raf = 0;
  let inView = true;

  function build() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = layer.clientWidth;
    const h = layer.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(w / step);
    rows = Math.ceil(h / step);
    const n = cols * rows;
    opacities = new Float32Array(n);
    targets = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = Math.random() * MAX_OPACITY;
      opacities[i] = v;
      targets[i] = v;
    }
  }

  function draw() {
    const w = layer.clientWidth;
    const h = layer.clientHeight;
    ctx.clearRect(0, 0, w, h);
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++, i++) {
        const o = opacities[i];
        if (o < 0.004) continue;
        ctx.fillStyle = `rgba(${BLUE_RGB},${o.toFixed(3)})`;
        ctx.fillRect(c * step, r * step, CELL, CELL);
      }
    }
  }

  // The cinematic fades the hero layer out via inline opacity as the
  // scroll sequence takes over — skip drawing while it is faded.
  function heroActive() {
    if (document.hidden) return false;
    const o = parseFloat(layer.style.opacity);
    if (!Number.isNaN(o) && o < 0.05) return false;
    const rect = layer.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  }

  function schedule() {
    if (!raf && inView && !reduced) {
      raf = requestAnimationFrame(tick);
    }
  }

  function tick() {
    raf = 0;
    if (!inView) return;
    if (heroActive()) {
      const n = opacities.length;
      for (let i = 0; i < n; i++) {
        if (Math.random() < FLICKER_CHANCE) {
          targets[i] = Math.random() * MAX_OPACITY;
        }
        opacities[i] += (targets[i] - opacities[i]) * EASE;
      }
      draw();
    }
    schedule();
  }

  function cancel() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => {
        inView = entries[0].isIntersecting;
        if (inView) schedule();
        else cancel();
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
        build();
        draw();
      }, 120);
    },
    { passive: true },
  );

  build();
  draw(); // one static frame immediately; the loop takes over unless reduced
  schedule();
}
