/**
 * The client IP for rate limiting, from the proxy chain.
 *
 * The LEFTMOST `x-forwarded-for` entry is the client as reported by Vercel's
 * edge; it is attacker-controllable in principle, which is exactly why an
 * unusable value must degrade to "no IP bucket" rather than to a block, and why
 * no limiter may rely on it as its ONLY bucket for a privileged operation.
 */
export function clientIpFromHeaders(headers: {
  get(name: string): string | null
}): string | undefined {
  const forwarded = headers.get('x-forwarded-for')
  const candidate = forwarded?.split(',')[0]?.trim()
  if (candidate) return candidate
  return headers.get('x-real-ip')?.trim() || undefined
}
