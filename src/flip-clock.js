// Reel countdown to Acalanes Data Fest 2026.
//
// Target is doors-open morning of the event, Pacific time. If the real
// start time differs, change TARGET below — everything else follows.
//
// Bike-lock animation, not split-flap: every digit is its own vertical
// wheel with 0-9 stacked in a column. When a digit changes, its wheel
// slides to the new digit, rolling through the numbers in between on a
// rollover (for example 0 back to 9), the way a combination-lock dial
// spins through its numbers. Respects prefers-reduced-motion (snaps).
import './flip-clock.css';

const TARGET = new Date('2026-11-21T09:00:00-08:00');

const UNITS = [
  { key: 'days', label: 'Days' },
  { key: 'hours', label: 'Hrs' },
  { key: 'mins', label: 'Min' },
  { key: 'secs', label: 'Sec' },
];

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// One bike-lock wheel: a window showing a single digit, with 0-9 stacked
// in a strip that slides vertically to the current digit.
function reel() {
  const windowEl = el('div', 'reel');
  const strip = el('div', 'reel-strip');
  for (let d = 0; d <= 9; d += 1) {
    strip.appendChild(el('span', 'reel-digit', String(d)));
  }
  windowEl.appendChild(strip);
  return { windowEl, strip };
}

function setReel(r, digit, animate) {
  // translateY is a percentage of the strip's own height (10 digits tall),
  // so -digit * 10% moves the strip exactly one digit height per digit.
  const y = -digit * 10;
  if (!animate || REDUCED) {
    r.strip.classList.remove('is-animating');
    r.strip.style.transform = `translateY(${y}%)`;
    // Force the snap to paint before the transition class comes back,
    // so the next change slides instead of jumping from a stale pose.
    void r.strip.offsetWidth;
    r.strip.classList.add('is-animating');
  } else {
    r.strip.style.transform = `translateY(${y}%)`;
  }
}

export function initFlipClock() {
  const mount = document.getElementById('countdown');
  if (!mount) return;

  const sr = el(
    'p',
    'sr-only',
    'Countdown to Acalanes Data Fest 2026, November 21, 2026 at 9:00 AM Pacific time.'
  );
  const row = el('div', 'reel-row');
  row.setAttribute('aria-hidden', 'true');

  const units = UNITS.map(({ key, label }) => {
    const unit = el('div', 'reel-unit');
    const card = el('div', 'reel-card');
    const reels = [reel(), reel()];
    reels.forEach((r) => card.appendChild(r.windowEl));
    unit.append(card, el('span', 'reel-label', label));
    row.appendChild(unit);
    return { key, reels, current: null };
  });

  // Replace the static date fallback with the live reel countdown.
  mount.replaceChildren(sr, row);
  mount.setAttribute('role', 'timer');
  mount.setAttribute('aria-label', 'Countdown to Acalanes Data Fest 2026');

  const render = (u, n) => {
    const v = String(n).padStart(2, '0');
    if (u.current === v) return;
    const animate = u.current !== null;
    v.split('').forEach((ch, i) => {
      setReel(u.reels[i], Number(ch), animate);
    });
    u.current = v;
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
