'use client'

import { useRef, type ReactNode } from 'react'
import { BackgroundPatternProvider } from '@/components/BackgroundPatternProvider'
import { ThemeStyle } from '@/components/ThemeStyle'
import { normalizeBackgroundPattern } from '@/lib/conference/backgroundPattern'
import type { ConferenceTheme } from '@/lib/branding/theme'
import { cn } from '@/lib/utils'
import type { PreviewColorScheme } from '@/lib/homepage/previewProtocol'
import { usePreviewDomGuard } from './usePreviewDomGuard'

export interface PreviewChromeProps {
  /** The tenant brand colours, injected as `--brand-*` exactly as the site does. */
  theme?: ConferenceTheme | null
  /** The tenant's stored background pattern id. */
  backgroundPattern?: string | null
  /** Which colour scheme the preview is showing, independent of the admin's. */
  scheme?: PreviewColorScheme
  /** Sanity asset `_ref` → `data:` URI, for placeholder gallery tiles. */
  placeholderImages?: ReadonlyMap<string, string>
  /**
   * Called when the organizer clicks the REAL `ThemeToggle` rendered inside the
   * previewed Header. See the reroute note below.
   */
  onThemeToggle?: () => void
  children: ReactNode
}

/**
 * The document shell the previewed homepage renders inside: tenant theme,
 * background pattern, colour scheme — and the four containment rules that make
 * rendering the REAL page components inside an editor safe.
 *
 * WHY THE TENANT THEME IS INJECTED HERE. `TenantThemeStyle` is rendered by the
 * PUBLIC route-group layouts only; admin is deliberately left on the house
 * palette so functional colour (status, alerts, charts) never collides with a
 * tenant hue. The preview is admin chrome showing tenant content, so it has to
 * bring the theme with it — otherwise every brand decision would preview in the
 * wrong colours.
 *
 * CONTAINMENT, in the order a click meets it:
 *
 *  1. **Analytics.** Handled by {@link usePreviewDomGuard} — the attribute
 *     sweep, not `preventDefault`. See that module for why.
 *  2. **Dead links.** A capture-phase click handler cancels any `a[href]`.
 *     Propagation is deliberately NOT stopped: the FAQ accordion, the gallery
 *     modal and the carousel are in-page behaviours the organizer should be able
 *     to exercise, and they listen further down the tree.
 *  3. **The theme toggle.** The previewed Header contains the real
 *     `ThemeToggle`, which writes next-themes' ORIGIN-WIDE localStorage key —
 *     clicking it would re-theme the admin app around the preview. Matched by
 *     `data-slot="theme-toggle"` and rerouted to {@link onThemeToggle}, with
 *     propagation stopped so the real handler never runs.
 *  4. **Forms.** Nothing in the composition submits one today; cancelling
 *     submits anyway costs one line and means a future section can't navigate
 *     the frame away.
 */
export function PreviewChrome({
  theme,
  backgroundPattern,
  scheme = 'light',
  placeholderImages,
  onThemeToggle,
  children,
}: PreviewChromeProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  usePreviewDomGuard(rootRef, { placeholderImages })

  return (
    <div
      ref={rootRef}
      data-preview-root=""
      // The scheme is applied as a class here so this component is truthful in
      // isolation (Storybook, tests). The iframe route ALSO stamps
      // `documentElement`, because a `.dark` inherited from the admin document
      // cannot be undone from a descendant.
      className={cn(
        'flex min-h-full w-full flex-col bg-white dark:bg-gray-950',
        scheme === 'dark' && 'dark',
      )}
      onClickCapture={(event) => {
        const target = event.target as Element | null
        if (!target?.closest) return
        if (target.closest('[data-slot="theme-toggle"]')) {
          event.preventDefault()
          event.stopPropagation()
          onThemeToggle?.()
          return
        }
        if (target.closest('a[href]')) event.preventDefault()
      }}
      onAuxClickCapture={(event) => {
        // Middle-click opens a link in a new tab without firing `click`.
        const target = event.target as Element | null
        if (target?.closest?.('a[href]')) event.preventDefault()
      }}
      onSubmitCapture={(event) => event.preventDefault()}
    >
      <ThemeStyle theme={theme} />
      <BackgroundPatternProvider
        pattern={normalizeBackgroundPattern(backgroundPattern)}
      >
        {children}
      </BackgroundPatternProvider>
    </div>
  )
}
