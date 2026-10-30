// Countdown to Acalanes Data Fest 2026, rendered with NumberFlow.
//
// Target is doors-open morning of the event, Pacific time. If the real
// start time differs, change TARGET below — everything else follows.
//
// NumberFlow is the vanilla `number-flow` package: the same custom-element
// core the React wrapper wraps, so the animation is identical without
// adding React to this vanilla Vite site. Each unit is one <number-flow>
// element; when its value changes, NumberFlow slides its digits.
// `trend: -1` makes digits always roll downward (a countdown), and
// `digits` caps each position so rollovers wrap correctly (59 -> 00 for
// minutes/seconds). It respects prefers-reduced-motion by default.
import 'number-flow';
import './flip-clock.css';

const TARGET = new Date('2026-11-21T09:00:00-08:00');

// Digit positions count from the units place: 0 = units, 1 = tens.
const UNITS = [
  { key: 'days', label: 'Days', digits: { 1: { max: 9 }, 0: { max: 9 } } },
  { key: 'hours', label: 'Hrs', digits: { 1: { max: 2 }, 0: { max: 9 } } },
  { key: 'mins', label: 'Min', digits: { 1: { max: 5 }, 0: { max: 9 } } },
  { key: 'secs', label: 'Sec', digits: { 1: { max: 5 }, 0: { max: 9 } } },
];

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
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

  const units = UNITS.map(({ key, label, digits }) => {
    const unit = el('div', 'reel-unit');
    const card = el('div', 'reel-card');
    const flow = document.createElement('number-flow');
    flow.setAttribute('data-will-change', '');
    flow.format = { minimumIntegerDigits: 2, useGrouping: false };
    flow.digits = digits;
    flow.trend = -1;
    card.appendChild(flow);
    unit.append(card, el('span', 'reel-label', label));
    row.appendChild(unit);
    return { key, flow, current: null };
  });

  // Replace the static date fallback with the live countdown.
  mount.replaceChildren(sr, row);
  mount.setAttribute('role', 'timer');
  mount.setAttribute('aria-label', 'Countdown to Acalanes Data Fest 2026');

  const render = (u, n) => {
    if (u.current === n) return;
    // The first update() hydrates the element; later ones animate.
    u.flow.update(n);
    u.current = n;
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
