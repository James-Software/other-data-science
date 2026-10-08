// Flip-clock countdown for the hero.
//
// Counts down to the event date. The target below is a PLACEHOLDER —
// update TARGET_ISO (plus the <time> element in index.html and the README
// note) when the real date is confirmed. Keep the -07:00 offset in sync
// with America/Los_Angeles daylight time for the chosen date.
//
// Each unit is a split-flap card: when the value changes, the top leaf
// (old value) falls away revealing the new top half, then the bottom leaf
// (new value) lands — one clean flip per change, exactly like the
// TSX flipping-numbers components, implemented here in vanilla JS/CSS
// (no framework on this site). Under prefers-reduced-motion the digits
// swap instantly. The timer is aria-live="off" with a static <time>
// fallback so screen readers are not spammed every second.
//
// Root-cause note on the old blur-morph's double transition: it used a
// two-element swap — a `.cd-next` span animated in, then a timeout set
// `.cd-cur`'s text to the new value and removed the `.morph` class. But
// `.cd-cur` kept its CSS `transition`, so removing the class made it
// transition *back* from its blurred/slid-out state to rest while already
// showing the new text — a second visible transition into the same
// number. The flip design below has no such swap: the value commits only
// after the flip lands, with the leaves hidden, so nothing can move twice.

// PLACEHOLDER — event date/timezone. America/Los_Angeles, currently PDT (-07:00).
const TARGET_ISO = '2026-10-30T00:00:00-07:00';
const TICK_MS = 250;
const FALL_MS = 280; // top leaf falls away
const LAND_MS = 280; // bottom leaf lands

export function initCountdown() {
  const root = document.getElementById('countdown');
  if (!root) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const target = new Date(TARGET_ISO).getTime();

  const units = ['days', 'hours', 'minutes', 'seconds'].map((name) => {
    const box = root.querySelector(`[data-unit="${name}"]`);
    const q = (sel) => (box ? box.querySelector(sel) : null);
    return {
      name,
      topStatic: q('.flip-top-static > span'),
      botStatic: q('.flip-bottom-static > span'),
      topLeaf: q('.flip-leaf-top'),
      botLeaf: q('.flip-leaf-bottom'),
      topLeafText: q('.flip-leaf-top > span'),
      botLeafText: q('.flip-leaf-bottom > span'),
      value: null, // last committed value (what the statics show at rest)
      target: null, // value currently flipping toward (null when idle)
      busy: false,
      t1: 0,
      t2: 0,
    };
  });
  if (units.some((u) => !u.topStatic || !u.topLeaf)) return;

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
    unit.topStatic.textContent = text;
    unit.botStatic.textContent = text;
    unit.topLeafText.textContent = text;
    unit.botLeafText.textContent = text;
    unit.value = text;
  }

  function finishFlip(unit) {
    const t = unit.target;
    window.clearTimeout(unit.t1);
    window.clearTimeout(unit.t2);
    // Commit with the leaves hidden: statics show the new value at rest,
    // leaves reset — nothing visible moves, so no second transition.
    unit.topStatic.textContent = t;
    unit.botStatic.textContent = t;
    unit.topLeafText.textContent = t;
    unit.botLeafText.textContent = t;
    unit.topLeaf.classList.remove('show', 'fall');
    unit.botLeaf.classList.remove('show', 'folded', 'land');
    unit.value = t;
    unit.target = null;
    unit.busy = false;
  }

  function startFlip(unit, text) {
    const old = unit.value;
    // Choreography: top static shows NEW behind the falling old top leaf;
    // bottom static keeps OLD behind the folded new bottom leaf.
    unit.topStatic.textContent = text;
    unit.botStatic.textContent = old;
    unit.topLeafText.textContent = old;
    unit.botLeafText.textContent = text;
    unit.topLeaf.classList.add('show');
    unit.botLeaf.classList.add('show', 'folded');
    // Force reflow so the fall animation runs from the flat state.
    void unit.topLeaf.offsetWidth;
    unit.topLeaf.classList.add('fall');
    unit.target = text;
    unit.busy = true;
    unit.t1 = window.setTimeout(() => {
      unit.botLeaf.classList.remove('folded');
      unit.botLeaf.classList.add('land');
    }, FALL_MS);
    unit.t2 = window.setTimeout(() => finishFlip(unit), FALL_MS + LAND_MS);
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
      const v = vals[u.name];
      // The root-cause fix: a flip starts only for a genuinely new value —
      // never for the committed value, and never re-triggered mid-flight
      // for the value already flipping toward.
      if (v === u.value || v === u.target) continue;
      if (initial || reduced) {
        setInstant(u, v);
      } else {
        if (u.busy) finishFlip(u); // tab was hidden: land the old flip instantly…
        startFlip(u, v); // …then flip once to the latest value
      }
    }
    return p.days === 0 && p.hours === 0 && p.minutes === 0 && p.seconds === 0;
  }

  render(true);
  const timer = window.setInterval(() => {
    if (render(false)) window.clearInterval(timer); // reached zero: stop ticking
  }, TICK_MS);
}
