import { conferenceThemeCss, type ConferenceTheme } from '@/lib/branding/theme'

/**
 * Injects a conference's per-tenant brand theme (THEMING L1) as a single
 * `<style>` setting the `--brand-*` custom properties on `:root`. Rendered by
 * the tenant `Layout` (which has already domain-resolved the conference), so it
 * is per-tenant by construction and cached with the rest of that layout.
 *
 * When the conference has no theme (or only invalid colours), `conferenceThemeCss`
 * returns an empty string and NOTHING is rendered — the default site output
 * stays byte-identical, which is the L1 no-visual-change guarantee.
 *
 * The style tag reads the same `--brand-*` variables that both the light and the
 * dark brand rules fall back through, so this one `:root` block re-skins both
 * colour schemes without a `.dark` override.
 */
export function ThemeStyle({ theme }: { theme?: ConferenceTheme | null }) {
  const css = conferenceThemeCss(theme)
  if (!css) return null
  return (
    // The content is machine-generated from validated hex colours (see
    // `conferenceThemeCss`), never raw user markup.
    <style data-tenant-theme dangerouslySetInnerHTML={{ __html: css }} />
  )
}
