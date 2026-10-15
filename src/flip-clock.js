// Flip-clock countdown to Acalanes Data Fest 2026.
//
// Target is doors-open morning of the event, Pacific time. If the real
// start time differs, change TARGET below — everything else follows.
//
// Split-flap animation: on each change the top flap (old value) falls away,
// the statics jump to the new value underneath, then the bottom flap (new
// value) falls into place. Respects prefers-reduced-motion (snaps instead).
import './flip-clock.css';

const TARGET = new Date('2026-11-21T09:00:00-08:00');

const UNITS = [
  { key: 'days', label: 'Days' },
  { key: 'hours', label: 'Hrs' },
  { key: 'mins', label: 'Min' },
  { key: 'secs', label: 'Sec' },
];

const FLIP_MS = 260;
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function half(cls) {
  const d = el('div', 'flip-half ' + cls);
  d.appendChild(el('span', null, '00'));
  return d;
}

function setHalf(node, value) {
  node.firstChild.textContent = value;
}

export function initFlipClock() {
  const mount = document.getElementById('countdown');
  if (!mount) return;

  const sr = el(
    'p',
    'sr-only',
    'Countdown to Acalanes Data Fest 2026, November 21, 2026 at 9:00 AM Pacific time.'
  );
  const row = el('div', 'flip-row');
  row.setAttribute('aria-hidden', 'true');

  const units = UNITS.map(({ key, label }) => {
    const unit = el('div', 'flip-unit');
    const card = el('div', 'flip');
    const top = half('flip-top');
    const bottom = half('flip-bottom');
    const flapTop = half('flip-flap flip-flap-top');
    const flapBottom = half('flip-flap flip-flap-bottom');
    card.append(top, bottom, flapTop, flapBottom);
    unit.append(card, el('span', 'flip-label', label));
    row.appendChild(unit);
    return { key, top, bottom, flapTop, flapBottom, current: null, timer: 0 };
  });

  // Replace the static date fallback with the live flip clock.
  mount.replaceChildren(sr, row);
  mount.setAttribute('role', 'timer');
  mount.setAttribute('aria-label', 'Countdown to Acalanes Data Fest 2026');

  const snap = (u, v) => {
    if (u.timer) {
      clearTimeout(u.timer);
      u.timer = 0;
    }
    setHalf(u.top, v);
    setHalf(u.bottom, v);
    u.flapTop.style.transition = 'none';
    u.flapBottom.style.transition = 'none';
    u.flapTop.style.visibility = 'hidden';
    u.flapBottom.style.visibility = 'hidden';
    u.current = v;
  };

  const flipTo = (u, prev, next) => {
    if (u.timer) {
      clearTimeout(u.timer);
      u.timer = 0;
    }
    const { flapTop, flapBottom, top, bottom } = u;
    setHalf(flapTop, prev);
    setHalf(flapBottom, next);
    // Start pose: top flap flat showing the old value, bottom flap folded
    // up at 90 degrees showing the new value.
    flapTop.style.transition = 'none';
    flapBottom.style.transition = 'none';
    flapTop.style.transform = 'rotateX(0deg)';
    flapBottom.style.transform = 'rotateX(90deg)';
    flapTop.style.visibility = 'visible';
    flapBottom.style.visibility = 'visible';
    void flapTop.offsetWidth; // paint the start pose before animating
    // Phase 1 — the top flap falls away…
    flapTop.style.transition = 'transform ' + FLIP_MS + 'ms ease-in';
    flapTop.style.transform = 'rotateX(-90deg)';
    u.timer = setTimeout(() => {
      // …midpoint: statics jump to the new value underneath…
      setHalf(top, next);
      setHalf(bottom, next);
      flapTop.style.visibility = 'hidden';
      // …phase 2: the bottom flap falls into place.
      flapBottom.style.transition = 'transform ' + FLIP_MS + 'ms ease-out';
      flapBottom.style.transform = 'rotateX(0deg)';
      u.timer = setTimeout(() => {
        flapBottom.style.visibility = 'hidden';
        u.timer = 0;
      }, FLIP_MS + 40);
    }, FLIP_MS + 40);
    u.current = next;
  };

  const render = (u, n) => {
    const v = String(n).padStart(2, '0');
    if (u.current === v) return;
    if (REDUCED || u.current === null) snap(u, v);
    else flipTo(u, u.current, v);
  };

  const tick = () => {
    const diff = Math.max(0, TARGET.getTime() - Date.now());
    render(units[0], Math.min(99, Math.floor(diff / 86400000)));
    render(units[1], Math.floor(diff / 3600000) % 24);
    render(units[2], Math.floor(diff / 60000) % 60);
    render(units[3], Math.floor(diff / 1000) % 60);
  };

  tick();
  setInterval(tick, 250);
}
