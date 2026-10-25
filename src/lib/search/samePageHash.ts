/**
 * When `url` points at the page we are already on and carries a hash, return
 * that hash (`#visibility`); otherwise null. A hash-only `router.push` fires
 * no `hashchange`, so listeners such as the Settings collapsible groups never
 * hear about it — the caller sets `location.hash` instead.
 */
export function samePageHash(
  url: string,
  current: { origin: string; pathname: string; search: string },
): string | null {
  let target: URL
  try {
    target = new URL(url, current.origin + current.pathname + current.search)
  } catch {
    return null
  }
  if (!target.hash || target.hash === '#') return null
  return target.origin === current.origin &&
    target.pathname === current.pathname &&
    target.search === current.search
    ? target.hash
    : null
}
