// Countdown clock for the hero.
//
// Counts down to the event date. The target below is a PLACEHOLDER —
// update TARGET_ISO (plus the <time> element in index.html and the README
// note) when the real date is confirmed. Keep the -07:00 offset in sync
// with America/Los_Angeles daylight time for the chosen date.
//
// When a unit's value changes, only that unit animates: the old digits
// blur/fade/slide out while the new digits blur/fade/slide in (~300ms,
// ease-out). Under prefers-reduced-motion the digits swap instantly.
// The timer is aria-live="off" with a static <time> fallback so screen
// readers are not spammed every second.

// PLACEHOLDER — event date/timezone. America/Los_Angeles, currently PDT (-07:00).
const TARGET_ISO = '2026-10-30T00:00:00-07:00';
const TICK_MS = 250;
const MORPH_MS = 300;

export function initCountdown() {
  const root = document.getElementById('countdown');
  if (!root) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const target = new Date(TARGET_ISO).getTime();

  const units = ['days', 'hours', 'minutes', 'seconds'].map((name) => {
    const box = root.querySelector(`[data-unit="${name}"]`);
    const digits = box ? box.querySelector('.cd-digits') : null;
    return {
      name,
      digits,
      cur: digits ? digits.querySelector('.cd-cur') : null,
      value: null,
      busy: false,
    };
  });
  if (units.some((u) => !u.digits || !u.cur)) return;

  function parts() {
    // Clamp at zero once the date passes — never show negative values.
    let ms = Math.max(0, target - Date.now());
    const days = Math.floor(ms / 86400000);
    ms -= days * 86400000;
    const hours = Math.floor(ms / 3600000);
    ms -= hours * 3600000;
    const minutes = Math.floor(ms / 60000);
    ms -= minutes * 60000;
    const seconds = Math.floor(ms / 1000);
    return { days, hours, minutes, seconds };
  }

  const fmt = (v) => String(v).padStart(2, '0');

  function setInstant(unit, text) {
    unit.cur.textContent = text;
    unit.value = text;
  }

  function morph(unit, text) {
    if (reduced) {
      setInstant(unit, text);
      return;
    }
    if (unit.busy) {
      // A change landed mid-morph (e.g. the tab was hidden): finish the
      // pending swap instantly, then start the new morph cleanly.
      const pending = unit.digits.querySelector('.cd-next');
      if (pending) pending.remove();
      setInstant(unit, text);
      unit.digits.classList.remove('morph');
      unit.busy = false;
    }
    const next = document.createElement('span');
    next.className = 'cd-next';
    next.setAttribute('aria-hidden', 'true');
    next.textContent = text;
    unit.digits.appendChild(next);
    // Force reflow so the transition runs from the initial blurred state.
    void next.offsetWidth;
    unit.digits.classList.add('morph');
    unit.busy = true;
    unit.value = text;
    window.setTimeout(() => {
      unit.cur.textContent = text;
      next.remove();
      unit.digits.classList.remove('morph');
      unit.busy = false;
    }, MORPH_MS + 40);
  }

  function render(initial) {
    const p = parts();
    const vals = {
      days: fmt(p.days),
      hours: fmt(p.hours),
      minutes: fmt(p.minutes),
      seconds: fmt(p.seconds),
    };
    for (const u of units) {
      if (u.value !== vals[u.name]) {
        if (initial || reduced) setInstant(u, vals[u.name]);
        else morph(u, vals[u.name]);
      }
    }
    return p.days === 0 && p.hours === 0 && p.minutes === 0 && p.seconds === 0;
  }

  render(true);
  const timer = window.setInterval(() => {
    if (render(false)) window.clearInterval(timer); // reached zero: stop ticking
  }, TICK_MS);
}
