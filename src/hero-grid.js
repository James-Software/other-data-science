// Smooth cascade particle field for the hero.
//
// Soft blue particles drift down and outward from the top like a slow
// cascade, rendered as smooth anti-aliased dots in one blue (#2E4BFF)
// over the white page — no grid snapping, no dither steps, no flicker.
// A density mask keeps the center mostly white; the flow lives on the
// left and right sides, with a whisper drifting through the middle so
// it never looks cut out. Small dense dots keep the field fine-grained.
//
// The cursor has velocity-based physics: the pointer's velocity is
// tracked and smoothed, and particles near it receive (1) radial
// repulsion scaled by cursor speed — a fast whip flings particles, a
// slow hover parts them gently, a still cursor keeps a soft minimum
// parting — and (2) a directional shove along the cursor's velocity
// vector with quadratic drag. Semi-implicit Euler integration at frame
// dt, strong damping so displaced particles settle and rejoin the
// cascade flow — no permanent displacement, no runaway.
// Full-resolution DPR-aware canvas; the rAF loop runs only while the
// hero is visible; one static frame under prefers-reduced-motion.

const BLUE = '46,75,255'; // #2E4BFF — the only hue ever drawn

// Velocity-based cursor physics (units: CSS px, seconds).
const FORCE_R = 200;   // px, radius of influence around the pointer
const RAD_BASE = 200;  // px/s^2, radial push with a still cursor
const RAD_GAIN = 0.22; // extra radial push per (px/s) of cursor speed
const SHOVE = 0.0048;  // quadratic drag: shove per (px/s)^2 of cursor speed —
                       // a whip flings particles, a slow hover barely stirs them
const DAMP = 4.5;      // 1/s, velocity damping — particles settle back to the flow
const VMAX = 650;      // px/s, particle speed clamp
const CUR_VMAX = 4500; // px/s, cursor velocity clamp (kills noise spikes)
const CUR_SMOOTH = 0.35; // per-event smoothing of the cursor velocity estimate
const CUR_DECAY = 10;  // 1/s, decay of the estimate over gaps between events
const CUR_STALE = 0.12; // s without a move event before the cursor reads as still

const DT_MAX = 0.05; // s, clamp frame dt — frame-rate independent, spike-safe

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

  // Pre-rendered soft dot sprite: radial falloff, no hard edges.
  const SPR = 48;
  const sprite = document.createElement('canvas');
  sprite.width = SPR;
  sprite.height = SPR;
  const sctx = sprite.getContext('2d');
  const grad = sctx.createRadialGradient(SPR / 2, SPR / 2, 0, SPR / 2, SPR / 2, SPR / 2);
  grad.addColorStop(0, `rgba(${BLUE},1)`);
  grad.addColorStop(0.55, `rgba(${BLUE},0.55)`);
  grad.addColorStop(1, `rgba(${BLUE},0)`);
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, SPR, SPR);

  const t0 = performance.now() / 1000;
  let w = 0;
  let h = 0;
  let cx = 0; // horizontal center, in px
  let parts = []; // cascade particles: {x, y, vy, seed, age, r, a, pvx, pvy}
  let ptx = 0; // pointer position, in px
  let pty = 0;
  let cvx = 0; // smoothed cursor velocity, in px/s
  let cvy = 0;
  let lastPx = 0; // last pointer sample, in px
  let lastPy = 0;
  let lastPt = -1; // time of last pointer sample, in seconds
  let pointerActive = false; // pointer currently over the hero
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
    // only a whisper of particles.
    let x = Math.random() * w;
    for (let k = 0; k < 8; k++) {
      const cand = Math.random() * w;
      const u = Math.abs(cand - cx) / (w / 2);
      if (Math.random() < sideMask(u)) {
        x = cand;
        break;
      }
      x = cand;
    }
    p.x = x;
    p.y = -20 - Math.random() * h * 0.12; // just above / at the top
    p.vy = 65 + Math.random() * 45; // px/s downward
    p.seed = Math.random();
    p.age = 0;
    p.r = 1.0 + Math.random() * 1.0; // dot radius, CSS px — small and dense
    p.a = 0.5 + Math.random() * 0.35; // base opacity — smooth, never stepped
    p.pvx = 0; // cursor-physics velocity — damps back to 0, rejoins the flow
    p.pvy = 0;
  }

  function buildField() {
    const count = Math.max(1400, Math.min(5600, Math.round((w * h) / 300)));
    parts = [];
    for (let i = 0; i < count; i++) {
      const p = {};
      spawn(p);
      parts.push(p);
    }
  }

  // Advance the cascade: mostly downward, with an outward horizontal
  // component that grows away from the center, plus a gentle wobble.
  // Positions are continuous floats — nothing snaps to a grid.
  function advance(dt, t) {
    const half = w / 2;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const u = Math.min(1.2, Math.abs(p.x - cx) / half);
      const dir = p.x >= cx ? 1 : -1;
      const vx =
        dir * (15 + 65 * u) + 12.5 * Math.sin(t * 1.2 + p.seed * 6.283 + p.y * 0.009);
      const vy = p.vy * (0.9 + 0.2 * Math.sin(p.seed * 6.283 + t * 0.8));
      p.x += vx * dt;
      p.y += vy * dt;
      p.age += dt;
      if (p.y > h + 10 || p.x < -20 || p.x > w + 20 || p.age > 16) {
        spawn(p);
      }
    }
  }

  // Velocity-based cursor physics. Particles within FORCE_R receive a
  // radial push scaled by cursor speed plus a quadratic-drag shove along
  // the cursor's velocity vector; semi-implicit Euler integrates, strong
  // damping settles everything back into the cascade flow.
  function physics(dt, nowSec) {
    // No move event for a while: the cursor has stopped — decay the
    // estimate toward zero so it reads as still.
    if (nowSec - lastPt > CUR_STALE) {
      const dk = Math.exp(-dt * CUR_DECAY * 2);
      cvx *= dk;
      cvy *= dk;
    }
    const cspeed = Math.hypot(cvx, cvy);
    const fRad = RAD_BASE + RAD_GAIN * cspeed;
    const damp = Math.exp(-dt * DAMP);
    const R2 = FORCE_R * FORCE_R;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (pointerActive) {
        const dx = p.x - ptx;
        const dy = p.y - pty;
        const d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          let nx;
          let ny;
          let wgt;
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            const f = 1 - d / FORCE_R;
            wgt = f * f; // smooth quadratic falloff — no pop at the edge
            nx = dx / d;
            ny = dy / d;
          } else {
            // Dead-center on the pointer: shove along the cursor's motion.
            wgt = 1;
            if (cspeed > 1) {
              nx = cvx / cspeed;
              ny = cvy / cspeed;
            } else {
              nx = 1;
              ny = 0;
            }
          }
          p.pvx += (nx * fRad * wgt + cvx * cspeed * SHOVE * wgt) * dt;
          p.pvy += (ny * fRad * wgt + cvy * cspeed * SHOVE * wgt) * dt;
        }
      }
      p.pvx *= damp;
      p.pvy *= damp;
      const sp = Math.hypot(p.pvx, p.pvy);
      if (sp > VMAX) {
        const s = VMAX / sp;
        p.pvx *= s;
        p.pvy *= s;
      }
      p.x += p.pvx * dt;
      p.y += p.pvy * dt;
    }
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = layer.clientWidth;
    h = layer.clientHeight;
    cx = w / 2;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildField();
    // Pre-roll so the first paint already shows the cascade mid-flow.
    for (let k = 0; k < 70; k++) advance(1 / 60, k / 60);
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

  function layerPos(e) {
    const rect = layer.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  // Track the pointer's velocity: decay the old estimate over the gap
  // since the last event, then blend toward the new sample — per-event
  // exponential smoothing kills noise spikes without dulling real motion.
  // Clamped so a wild event can't fling the field.
  function trackPointer(p) {
    const now = performance.now() / 1000;
    if (lastPt > 0) {
      const edt = Math.max(1 / 240, now - lastPt);
      const dk = Math.exp(-edt * CUR_DECAY);
      cvx *= dk;
      cvy *= dk;
      const ivx = (p.x - lastPx) / edt;
      const ivy = (p.y - lastPy) / edt;
      cvx += (ivx - cvx) * CUR_SMOOTH;
      cvy += (ivy - cvy) * CUR_SMOOTH;
      const cs = Math.hypot(cvx, cvy);
      if (cs > CUR_VMAX) {
        const s = CUR_VMAX / cs;
        cvx *= s;
        cvy *= s;
      }
    }
    lastPx = p.x;
    lastPy = p.y;
    lastPt = now;
    ptx = p.x;
    pty = p.y;
    pointerActive = true;
  }

  function onMove(e) {
    if (reduced || !inView || !heroActive()) return;
    trackPointer(layerPos(e));
    kick();
  }

  function onDown(e) {
    if (reduced || !inView || !heroActive()) return;
    trackPointer(layerPos(e));
    kick();
  }

  function onLeave() {
    pointerActive = false; // forces stop; damping settles every particle
    lastPt = -1; // re-entry starts fresh, no stale-sample spike
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.x < -8 || p.y < -8 || p.x > w + 8 || p.y > h + 8) continue;
      // Continuous opacity: smooth fade in at the top, out at the bottom.
      const fadeIn = smoothstep(0, 0.6, p.age);
      const fadeOut = 1 - smoothstep(h - 70, h - 5, p.y);
      const a = p.a * fadeIn * fadeOut;
      if (a < 0.01) continue;
      const s = p.r * 2.4; // sprite draw size — soft falloff, no hard edge
      ctx.globalAlpha = a;
      ctx.drawImage(sprite, p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  function tick(now) {
    raf = 0;
    if (!inView) return;
    if (!heroActive()) {
      // Cinematic has the hero faded: poll slowly instead of burning frames.
      slowTimer = window.setTimeout(slowPoll, 500);
      return;
    }
    // Real frame dt, clamped: frame-rate independent, spike-safe.
    // Every rAF advances — no fixed timestep stepping, motion stays fluid.
    const dt = Math.min(DT_MAX, Math.max(0.001, (now - lastFrame) / 1000));
    lastFrame = now;
    const t = now / 1000 - t0;
    advance(dt, t);
    physics(dt, now / 1000);
    draw();
    raf = requestAnimationFrame(tick);
  }

  function slowPoll() {
    slowTimer = 0;
    if (!inView) return;
    if (heroActive()) {
      if (!raf) {
        lastFrame = performance.now();
        raf = requestAnimationFrame(tick);
      }
    } else {
      slowTimer = window.setTimeout(slowPoll, 500);
    }
  }

  function kick() {
    if (reduced || raf || slowTimer || !inView) return;
    if (heroActive()) {
      lastFrame = performance.now();
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
        draw();
      }, 120);
    },
    { passive: true },
  );

  resize();
  if (reduced) {
    draw(); // one static frame, no loop, no listeners
    return;
  }
  draw();
  layer.addEventListener('pointermove', onMove, { passive: true });
  layer.addEventListener('pointerdown', onDown, { passive: true });
  layer.addEventListener('pointerleave', onLeave, { passive: true });
  layer.addEventListener('pointercancel', onLeave, { passive: true });
  // Fade the field in once the first frame is painted.
  requestAnimationFrame(() => {
    canvas.style.opacity = '1';
  });
  if (inView) {
    lastFrame = performance.now();
    raf = requestAnimationFrame(tick);
  }
}
