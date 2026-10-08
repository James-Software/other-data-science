// Blur-and-rise entrance for the hero headline.
//
// Wraps each word in a nowrap inline-block (so words never break
// mid-word), then animates words from blurred + slightly lowered +
// transparent to sharp and in place, with a slight stagger. The full text
// is preserved on aria-label (words are aria-hidden) so screen readers
// hear it once. Skipped entirely under prefers-reduced-motion.

const STAGGER_MS = 70;

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
        // Split into words vs. whitespace: words become nowrap
        // inline-block wrappers (breaks only between words), whitespace
        // stays as plain text nodes.
        const parts = child.textContent.split(/(\s+)/);
        parts.forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) {
            frag.appendChild(document.createTextNode(part));
          } else {
            const w = document.createElement('span');
            w.className = 'w';
            w.setAttribute('aria-hidden', 'true');
            w.textContent = part;
            w.style.animationDelay = `${i * STAGGER_MS}ms`;
            frag.appendChild(w);
            i++;
          }
        });
        node.replaceChild(frag, child);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        splitNode(child);
      }
    });
  };
  splitNode(h1);
  // With fill-mode backwards the `from` keyframe covers the stagger delay,
  // so the class can go on synchronously — no flash of the final state.
  h1.classList.add('rise');
}
