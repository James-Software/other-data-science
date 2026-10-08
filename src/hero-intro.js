// Letter-by-letter roll-in for the hero headline.
//
// Splits the h1's text into per-character spans with a staggered CSS
// animation. The full text is preserved on aria-label (chars are
// aria-hidden) so screen readers hear it once, not letter by letter.
// Skipped entirely under prefers-reduced-motion.

const STAGGER_MS = 28;

export function initHeroIntro() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const h1 = document.querySelector('.hero h1');
  if (!h1) return;

  const fullText = h1.textContent.replace(/\s+/g, ' ').trim();
  h1.setAttribute('aria-label', fullText);

  let i = 0;
  const splitNode = (node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const ch of child.textContent) {
          const s = document.createElement('span');
          s.className = 'ch';
          s.setAttribute('aria-hidden', 'true');
          s.textContent = ch;
          s.style.animationDelay = `${i * STAGGER_MS}ms`;
          frag.appendChild(s);
          i++;
        }
        node.replaceChild(frag, child);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        splitNode(child);
      }
    });
  };
  splitNode(h1);
}
