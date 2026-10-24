/**
 * Whether focus may be handed back when `container` closes: it is still in
 * it, or it has been lost (on <body>). Focus the organizer moved elsewhere
 * while an answer was on its way is never pulled back.
 */
export function focusIsWith(container: Element | null): boolean {
  const active = document.activeElement
  return (
    !active ||
    active === document.body ||
    (container !== null && container.contains(active))
  )
}
