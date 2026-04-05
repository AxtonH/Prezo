const PADDING = 8

/**
 * Scrolls a scroll container so `panel` is fully visible (or top-aligned if taller than the viewport).
 * Used when an activity panel expands inside a nested overflow scroll (e.g. session dashboard rail).
 */
export function scrollPanelIntoOverflowParent(
  panel: HTMLElement,
  scrollParent: HTMLElement,
  behavior: ScrollBehavior = 'smooth'
): void {
  const spRect = scrollParent.getBoundingClientRect()
  const available = spRect.height - PADDING * 2
  const elRect = panel.getBoundingClientRect()
  const elHeight = elRect.height

  let delta = 0
  if (elHeight > available) {
    delta = elRect.top - spRect.top - PADDING
  } else if (elRect.top < spRect.top + PADDING) {
    delta = elRect.top - spRect.top - PADDING
  } else if (elRect.bottom > spRect.bottom - PADDING) {
    delta = elRect.bottom - spRect.bottom + PADDING
  }

  if (Math.abs(delta) < 0.5) {
    return
  }
  scrollParent.scrollTo({
    top: scrollParent.scrollTop + delta,
    behavior
  })
}
