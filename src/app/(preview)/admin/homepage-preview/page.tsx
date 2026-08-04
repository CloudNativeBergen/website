'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { HomepagePreview } from '@/components/admin/preview'
import { resolveHomepageSections, type HomepageSection } from '@/lib/homepage'
import {
  isPreviewMessageEvent,
  isPreviewStateMessage,
  previewHoverMessage,
  previewReadyMessage,
  previewSelectMessage,
  previewSizeMessage,
  type PreviewColorScheme,
  type PreviewMode,
  type PreviewOutboundMessage,
  type PreviewUiState,
} from '@/lib/homepage/previewProtocol'
import { api } from '@/lib/trpc/client'

/**
 * `/admin/homepage-preview` — the document the homepage composer frames.
 *
 * It is a page rather than a component because a same-origin IFRAME is the only
 * mechanism that gives all four of these at once:
 *
 *  - **Viewport-true breakpoints.** The frame has its own layout viewport, so
 *    `lg:` means what it means on a real 1440px screen even though the pane is
 *    600px wide. (The composer scales the iframe ELEMENT; scaling an element
 *    does not change the layout viewport inside it — which is exactly why the
 *    same trick fails on a same-document wrapper.)
 *  - **CSS isolation.** The admin app's resets and the tenant page's styles
 *    cannot reach each other across a document boundary.
 *  - **Crash isolation.** Nothing rendered here can take the composer down.
 *  - **No persistence.** Unsaved state arrives over `postMessage`; nothing is
 *    written, so there is no draft store, no cache busting and no URL smuggling.
 *
 * Data comes from one uncached admin query; the composition comes from the
 * parent. Until the parent speaks, the SAVED composition renders — so opening
 * this URL directly shows the tenant's current front page rather than a blank
 * frame.
 */
export default function HomepagePreviewPage() {
  const { data, isPending, error } =
    api.conference.homepagePreviewData.useQuery(undefined, {
      // Freshness is the entire point of the endpoint; caching it in the client
      // would re-introduce the staleness the server side went out of its way to
      // avoid.
      staleTime: 0,
      refetchOnWindowFocus: false,
    })

  const [sections, setSections] = useState<HomepageSection[] | null>(null)
  const [ui, setUi] = useState<PreviewUiState>({
    mode: 'design',
    scheme: 'light',
    focusKey: null,
    hoverKey: null,
  })
  /**
   * Bumped on every accepted state push. Feeds the per-band error boundaries:
   * a band that threw on a half-typed config tries again on the next keystroke.
   */
  const [stateVersion, setStateVersion] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  const post = useCallback((message: PreviewOutboundMessage) => {
    if (typeof window === 'undefined' || window.parent === window) return
    // Same-origin by construction; naming the origin rather than '*' keeps the
    // payload off any other document that might come to host this frame.
    window.parent.postMessage(message, window.location.origin)
  }, [])

  // --- The channel ---------------------------------------------------------
  // Mount: announce readiness and start listening. The parent answers every
  // `ready` with its current state, so a reload of this frame (HMR, a session
  // refresh, an in-frame navigation) re-syncs with no reconnect protocol and no
  // "handshake complete" flag on either side.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // ORIGIN CHECK FIRST. This origin also serves tenant-authored public
      // pages, so `event.source` proves nothing; anything from elsewhere is a
      // browser extension or an attack and is dropped before inspection.
      if (!isPreviewMessageEvent(event, window.location.origin)) return
      if (!isPreviewStateMessage(event.data)) return
      setSections(event.data.sections)
      setUi(event.data.ui)
      setStateVersion((version) => version + 1)
    }
    window.addEventListener('message', onMessage)
    post(previewReadyMessage())
    return () => window.removeEventListener('message', onMessage)
  }, [post])

  // Report the rendered height so the composer can size the pane to the page
  // rather than guessing or scrolling a fixed box.
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const report = () => post(previewSizeMessage(root.scrollHeight))
    report()
    const observer = new ResizeObserver(report)
    observer.observe(root)
    return () => observer.disconnect()
  }, [post, sections, ui.mode, data])

  // The colour scheme must be stamped on THIS document's root element: a `.dark`
  // inherited from the admin document cannot be undone by a descendant, since
  // the dark variant matches `.dark *`. Initial value is taken from whatever the
  // admin's next-themes already set here, so the frame opens in the organizer's
  // current scheme; after that the composer's toolbar owns it.
  const scheme = ui.scheme
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', scheme === 'dark')
    root.style.colorScheme = scheme
  }, [scheme])

  // ONE-TIME adoption of whatever scheme the admin document's next-themes
  // already stamped on this frame, so the preview opens in the scheme the
  // organizer is working in rather than always in light. It has to be an effect:
  // the value only exists in the browser, and reading it during render would
  // make the server and client markup disagree. It runs once, sets state once,
  // and is then overridden by the composer's toolbar — the cascade the rule
  // warns about is exactly one render, on mount.
  useEffect(() => {
    const inherited = document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light'
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUi((current) =>
      current.scheme === inherited
        ? current
        : { ...current, scheme: inherited },
    )
  }, [])

  const setScheme = useCallback((next: PreviewColorScheme) => {
    setUi((current) => ({ ...current, scheme: next }))
  }, [])

  if (error) {
    return (
      <PreviewMessagePlate title="Preview unavailable" body={error.message} />
    )
  }
  if (isPending || !data) {
    return <PreviewMessagePlate title="Loading preview…" />
  }

  const composition = sections ?? resolveHomepageSections(data.conference)
  const mode: PreviewMode = ui.mode

  return (
    <div ref={rootRef}>
      <HomepagePreview
        conference={data.conference}
        sections={composition}
        mode={mode}
        scheme={scheme}
        ticketsFromPrice={data.ticketsFromPrice}
        ticketAvailability={data.ticketAvailability}
        focusKey={ui.focusKey}
        hoverKey={ui.hoverKey}
        resetKey={stateVersion}
        onSelect={(key) => post(previewSelectMessage(key))}
        onHover={(key) => post(previewHoverMessage(key))}
        onThemeToggle={() => setScheme(scheme === 'dark' ? 'light' : 'dark')}
      />
    </div>
  )
}

function PreviewMessagePlate({
  title,
  body,
}: {
  title: string
  body?: string
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-8 text-center dark:bg-gray-950">
      <div>
        <p className="font-space-grotesk text-base font-semibold text-gray-700 dark:text-gray-200">
          {title}
        </p>
        {body && (
          <p className="font-inter mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
            {body}
          </p>
        )}
      </div>
    </div>
  )
}
