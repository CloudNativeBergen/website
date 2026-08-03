import { PLATFORM_NAME, PLATFORM_URL } from '@/lib/branding/platform'

/**
 * The "Powered by Konf" platform credit.
 *
 * Part of the theming system rather than a hardcoded footer string: the platform
 * name comes from {@link PLATFORM_NAME} and the target from {@link PLATFORM_URL},
 * and the name is painted with `bg-brand-gradient` — the same
 * `--brand-primary`/`--brand-accent` pair `TenantThemeStyle` injects — so on a
 * themed conference the credit sits IN the tenant's palette instead of next to
 * it. Unthemed tenants get the house gradient via the CSS fallbacks.
 *
 * Deliberately ONE self-contained component with ONE call site (the tenant
 * `Footer`). That is the seam a future plan entitlement — "remove the platform
 * credit" — hangs off: gate the single render, not a string scattered through
 * layouts. No toggle is built here.
 */
export function PoweredBy({ className }: { className?: string }) {
  return (
    <p
      className={
        className ??
        'font-inter text-sm text-brand-cloud-gray dark:text-gray-400'
      }
    >
      Powered by{' '}
      <a
        href={PLATFORM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="bg-brand-gradient bg-clip-text font-semibold text-transparent transition-opacity hover:opacity-80"
      >
        {PLATFORM_NAME}
      </a>
    </p>
  )
}
