/**
 * Svelte action that watches descendants matching `selector` (default: `.sb-label`)
 * and adds a native `title` tooltip whenever the text is truncated by overflow.
 *
 * Usage:
 *   <aside use:autoTitle> ... </aside>          // default selector
 *   <aside use:autoTitle={'.my-label'}> ... </aside>
 *
 * The element must already truncate via CSS (`overflow: hidden; text-overflow: ellipsis;
 * white-space: nowrap`) for the overflow detection to work. We compare scrollWidth vs
 * clientWidth and set/remove `title` based on the result. We skip elements that already
 * have an authored `title` attribute.
 */
export function autoTitle(node: HTMLElement, param?: string) {
  let selector = param ?? '.sb-label';

  // Compute the "clean" label text: drop interactive children (buttons, links) and
  // adornments like .req-badge so the tooltip says "WebNN EP" rather than "WebNN EPreq".
  function cleanText(el: HTMLElement): string {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('button, a, .req-badge').forEach(n => n.remove());
    return (clone.textContent ?? '').trim().replace(/\s+/g, ' ');
  }

  function update() {
    const els = node.querySelectorAll<HTMLElement>(selector);
    els.forEach((el) => {
      if (el.dataset.autoTitleSkip === '1') return;
      // Don't clobber an authored title; mark and skip.
      if (el.hasAttribute('title') && !el.dataset.autoTitleSet) {
        el.dataset.autoTitleSkip = '1';
        return;
      }
      const overflow = el.scrollWidth > el.clientWidth + 1;
      if (overflow) {
        const text = cleanText(el);
        if (text) {
          el.setAttribute('title', text);
          el.dataset.autoTitleSet = '1';
        }
      } else if (el.dataset.autoTitleSet) {
        el.removeAttribute('title');
        delete el.dataset.autoTitleSet;
      }
    });
  }

  const ro = new ResizeObserver(update);
  ro.observe(node);

  const mo = new MutationObserver(update);
  mo.observe(node, { childList: true, subtree: true, characterData: true });

  // Schedule one rAF after mount so initial layout is settled.
  requestAnimationFrame(update);

  return {
    update(next?: string) {
      selector = next ?? '.sb-label';
      update();
    },
    destroy() {
      ro.disconnect();
      mo.disconnect();
    },
  };
}
