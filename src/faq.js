// Animated FAQ expand/collapse.
//
// Opening: the native <details> toggle plus the CSS grid-rows transition
// (0fr -> 1fr) — no JS needed, works even without this module.
// Closing: the native toggle would hide the content instantly, so we
// intercept the summary click, add .closing (CSS animates 1fr -> 0fr
// while [open] is held), then remove [open] once the transition ends.
// Under prefers-reduced-motion we stay out of the way entirely: the
// native instant toggle applies.

export function initFaq() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  document.querySelectorAll('.faq details').forEach((d) => {
    const summary = d.querySelector('summary');
    const body = d.querySelector('.faq-answer');
    if (!summary || !body) return;

    summary.addEventListener('click', (e) => {
      if (d.classList.contains('closing')) {
        // Clicked mid-close: abort the close and stay open.
        e.preventDefault();
        d.classList.remove('closing');
        return;
      }
      if (!d.open) return; // opening: native toggle + CSS handles it

      e.preventDefault();
      d.classList.add('closing');
      let done = false;
      const finish = () => {
        if (done || !d.classList.contains('closing')) return;
        done = true;
        body.removeEventListener('transitionend', finish);
        d.classList.remove('closing');
        d.open = false;
      };
      body.addEventListener('transitionend', finish);
      window.setTimeout(finish, 400); // fallback if transitionend never fires
    });
  });
}
