/**
 * HTML-escape a value interpolated into a RAW HTML string — one that is NOT
 * built by JSX and therefore gets no auto-escaping. Two such sinks exist here:
 * email templates (plain template literals sent as `text/html`) and the
 * `/info` FAQ answers, which are handed to `dangerouslySetInnerHTML`.
 *
 * Every tenant- or user-derived value MUST pass through here before insertion.
 * Conference fields are editable by any organizer of a tenant, and tenants can
 * share a parent domain for session cookies, so an unescaped value on one
 * tenant's public page is a stored-XSS route to another tenant's session — not
 * merely a broken-markup nuisance.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
