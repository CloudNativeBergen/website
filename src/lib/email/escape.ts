/**
 * HTML-escape a value interpolated into a RAW email template string. Email
 * templates in this codebase are plain template literals (no JSX auto-escaping),
 * so every tenant- or user-derived value MUST pass through here before
 * insertion — a conference or organizer name containing `<`, `&` or quotes must
 * not break markup or inject content into outgoing mail.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
