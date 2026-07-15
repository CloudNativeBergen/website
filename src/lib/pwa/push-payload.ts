/**
 * Pure helper for turning a raw web-push data string into the arguments for
 * `ServiceWorkerRegistration.showNotification` (issue #444).
 *
 * `public/sw.js` is hand-written plain JS and cannot import this TypeScript
 * module, so it MIRRORS this logic inline. `__tests__/lib/pwa/sw-source.test.ts`
 * is the drift guard that keeps the two in sync. Keeping the parsing here makes
 * it unit-testable without a service-worker environment.
 */

export interface ParsedPushNotification {
  title: string
  body: string
  /** Same-origin path to open on click. Always starts with `/`. */
  url: string
  tag?: string
}

const DEFAULT_TITLE = 'Cloud Native Days'
const DEFAULT_URL = '/'

/**
 * Parse a push message body. Tolerates malformed / empty payloads by falling
 * back to safe defaults so the SW always shows *something* (a silent push is a
 * spec violation on most browsers).
 *
 * SECURITY: `url` is constrained to a same-origin absolute PATH — any absolute
 * URL, protocol-relative URL, or non-string is dropped in favour of `/`, so a
 * malformed payload can never redirect a click off-origin.
 */
export function parsePushPayload(
  raw: string | null | undefined,
): ParsedPushNotification {
  let data: Record<string, unknown> = {}
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        data = parsed as Record<string, unknown>
      }
    } catch {
      // Non-JSON payload: treat the raw string as the body.
      data = { body: raw }
    }
  }

  const title =
    typeof data.title === 'string' && data.title.trim()
      ? data.title
      : DEFAULT_TITLE
  const body = typeof data.body === 'string' ? data.body : ''
  const tag = typeof data.tag === 'string' ? data.tag : undefined

  return { title, body, url: sanitizeUrl(data.url), tag }
}

/** Only allow a same-origin absolute path (`/...`, not `//...`). */
function sanitizeUrl(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_URL
  if (value.startsWith('/') && !value.startsWith('//')) return value
  return DEFAULT_URL
}
