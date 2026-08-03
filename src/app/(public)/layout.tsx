import { TenantThemeStyle } from '@/components/TenantThemeStyle'

/**
 * The `(public)` group holds standalone, chrome-less tenant pages (today: the
 * shareable badge page). They render without the shared `Layout`, so before
 * this layout existed they were the one attendee-facing surface with no tenant
 * theme at all — a themed conference's badge page rendered in the house blue.
 *
 * This is the ONLY reason the group needs a layout, so it does exactly one
 * thing: inject the theme. `TenantThemeStyle` resolves the conference for the
 * request host itself (a cached, per-tenant-tagged read) because nothing else
 * in this layout needs the conference — the badge page does its own resolution
 * and 404s when the badge does not belong to the host's conference.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <TenantThemeStyle />
      {children}
    </>
  )
}
