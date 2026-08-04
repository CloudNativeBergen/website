'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowTopRightOnSquareIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  EyeIcon,
  MoonIcon,
  SparklesIcon,
  SunIcon,
} from '@heroicons/react/24/outline'
import type { HomepageSection } from '@/lib/homepage/sections'
import {
  PREVIEW_DEVICE_WIDTH,
  isPreviewMessageEvent,
  isPreviewOutboundMessage,
  previewStateMessage,
  type PreviewColorScheme,
  type PreviewDevice,
  type PreviewMode,
  type PreviewUiState,
} from '@/lib/homepage/previewProtocol'
import { SegmentedControl } from './SegmentedControl'

/** The route the frame loads. Its own layout repeats the organizer gate. */
export const PREVIEW_ROUTE = '/admin/homepage-preview'

/**
 * How long the composer coalesces edits before pushing them into the frame.
 *
 * Long enough that a burst of typing is one message rather than thirty, short
 * enough that the page appears to follow the keystrokes. The push itself is one
 * `toPayload` plus one structured clone — nothing here is quadratic — so the
 * debounce is about render churn inside the frame, not about serialization
 * cost.
 */
export const PREVIEW_PUSH_DEBOUNCE_MS = 250

export interface PreviewPaneProps {
  /**
   * The composition to render — ALREADY serialized through the Save path's own
   * `toPayload`, so the frame renders what would be stored and not what the
   * form happens to hold.
   */
  sections: HomepageSection[]
  ui: PreviewUiState
  device: PreviewDevice
  /** Hidden below `lg`, where the pane is always a phone-width frame. */
  showDeviceToggle?: boolean
  onDeviceChange: (device: PreviewDevice) => void
  onModeChange: (mode: PreviewMode) => void
  onSchemeChange: (scheme: PreviewColorScheme) => void
  /** A band was clicked in the preview. */
  onSelect: (key: string) => void
  /** A band was hovered in the preview (`null` on leave). */
  onHover: (key: string | null) => void
  src?: string
  /**
   * STORYBOOK / TEST SEAM. An iframe cannot load an app route in Storybook, and
   * the workspace's whole point is the two panes side by side — so stories
   * render the very same `HomepagePreview` tree inline, at the same device
   * width and the same scale. The production path always uses the iframe: only
   * a separate document gives viewport-true breakpoints, CSS isolation and
   * crash isolation.
   */
  renderInline?: (args: {
    sections: HomepageSection[]
    ui: PreviewUiState
    onSelect: (key: string) => void
    onHover: (key: string | null) => void
  }) => ReactNode
}

/**
 * The right-hand pane: a real render of the organizer's front page, framed at a
 * truthful viewport width, plus the toolbar that decides which truth it shows.
 *
 * ## Why an iframe, and why scaling it is honest
 *
 * The frame is a same-origin document, so it has its OWN layout viewport: at
 * `desktop` the page inside genuinely lays out at 1440px and every `lg:` rule
 * means what it means on a desktop, even when the pane is 600px wide. The
 * iframe ELEMENT is then scaled with `transform`, which does not change the
 * layout viewport inside it — the standard site-builder trick, and the reason
 * the same scale on a same-document wrapper would be a lie about breakpoints.
 * At `mobile` the frame is exactly 390px and unscaled: on a phone-sized pane
 * the preview is 1:1 real.
 *
 * ## The channel
 *
 * Versioned, origin-checked `postMessage` in both directions
 * (`lib/homepage/previewProtocol`). The frame announces `ready` on every mount —
 * including after an HMR reload or a session refresh — and this pane answers
 * every `ready` with its current state, so the handshake needs no "connected"
 * flag on either side. Edits are pushed on a {@link PREVIEW_PUSH_DEBOUNCE_MS}
 * debounce; hover and click come back the other way and drive the rail.
 */
export function PreviewPane({
  sections,
  ui,
  device,
  showDeviceToggle = true,
  onDeviceChange,
  onModeChange,
  onSchemeChange,
  onSelect,
  onHover,
  src = PREVIEW_ROUTE,
  renderInline,
}: PreviewPaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const inlineRef = useRef<HTMLDivElement>(null)
  const readyRef = useRef(false)
  /** The last state pushed-or-pushable, for answering a `ready` handshake. */
  const latestRef = useRef({ sections, ui })
  /** Callbacks by ref so the message listener is mounted exactly once. */
  const handlersRef = useRef({ onSelect, onHover })

  const [paneSize, setPaneSize] = useState({ width: 0, height: 0 })
  /** Document height reported by the frame, so the PANE owns the scrollbar. */
  const [contentHeight, setContentHeight] = useState<number | null>(null)

  useEffect(() => {
    latestRef.current = { sections, ui }
    handlersRef.current = { onSelect, onHover }
  })

  const postState = useCallback(
    (payload: { sections: HomepageSection[]; ui: PreviewUiState }) => {
      const target = frameRef.current?.contentWindow
      if (!target) return
      // Named origin rather than '*': this payload is an unsaved composition
      // and must not be readable by any other document that comes to host the
      // frame.
      target.postMessage(
        previewStateMessage(payload.sections, payload.ui),
        window.location.origin,
      )
    },
    [],
  )

  // --- inbound: ready / hover / select / size ------------------------------
  useEffect(() => {
    if (renderInline) return
    const onMessage = (event: MessageEvent) => {
      // ORIGIN FIRST. This origin also serves tenant-authored public pages, so
      // `event.source` proves nothing on its own; it is checked afterwards to
      // ignore any other frame on the page.
      if (!isPreviewMessageEvent(event, window.location.origin)) return
      if (event.source !== frameRef.current?.contentWindow) return
      if (!isPreviewOutboundMessage(event.data)) return
      const message = event.data
      switch (message.type) {
        case 'konf-preview-ready':
          readyRef.current = true
          postState(latestRef.current)
          break
        case 'konf-preview-hover':
          handlersRef.current.onHover(message.key)
          break
        case 'konf-preview-select':
          handlersRef.current.onSelect(message.key)
          break
        case 'konf-preview-size':
          setContentHeight(message.height)
          break
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [postState, renderInline])

  // --- outbound: the debounced state push ---------------------------------
  useEffect(() => {
    if (renderInline || !readyRef.current) return
    const timer = setTimeout(
      () => postState({ sections, ui }),
      PREVIEW_PUSH_DEBOUNCE_MS,
    )
    return () => clearTimeout(timer)
  }, [sections, ui, postState, renderInline])

  // --- geometry ------------------------------------------------------------
  useEffect(() => {
    const node = scrollRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const measure = () =>
      setPaneSize({ width: node.clientWidth, height: node.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // The inline (story) preview has no `size` message to report its height, so
  // it is measured directly — same job, same result, no protocol involved.
  useEffect(() => {
    const node = inlineRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const measure = () => setContentHeight(node.scrollHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [renderInline, sections, ui.mode])

  const frameWidth = PREVIEW_DEVICE_WIDTH[device]
  // Never scale UP: a 390px frame in a 900px pane stays a phone, it does not
  // become a blurry billboard.
  const availableWidth = Math.max(paneSize.width - 32, 240)
  const scale = Math.min(1, availableWidth / frameWidth)

  /**
   * Bring the SELECTED band into view — the other half of the locate loop.
   *
   * The pane owns the scrollbar (the frame is laid out at its full document
   * height), so this scroll happens out here rather than inside the preview.
   * It only fires when the band is not already comfortably visible: selecting
   * a card whose band is on screen should ring it, not yank the canvas.
   *
   * Same-origin makes `contentDocument` readable, and the band carries the same
   * `_key` in both documents — no extra protocol message for a lookup both ends
   * can already do.
   */
  useEffect(() => {
    const key = ui.focusKey
    const pane = scrollRef.current
    if (!key || !pane) return
    const escape = window.CSS?.escape ?? ((value: string) => value)
    const selector = `[data-preview-band="${escape(key)}"]`
    const paneTop = pane.getBoundingClientRect().top

    let target: number | null = null
    if (renderInline) {
      const band = inlineRef.current?.querySelector(selector)
      if (band) {
        target = pane.scrollTop + (band.getBoundingClientRect().top - paneTop)
      }
    } else {
      try {
        const frame = frameRef.current
        const band = frame?.contentDocument?.querySelector(selector)
        if (frame && band) {
          const frameTop =
            frame.getBoundingClientRect().top - paneTop + pane.scrollTop
          target = frameTop + band.getBoundingClientRect().top * scale
        }
      } catch {
        // A frame that is not (yet) same-origin readable simply does not
        // scroll: the ring on both sides still tells the organizer which band
        // they picked.
        return
      }
    }
    if (target === null) return

    const visibleFrom = pane.scrollTop
    const visibleTo = pane.scrollTop + pane.clientHeight - 96
    if (target >= visibleFrom && target <= visibleTo) return
    pane.scrollTo({
      top: Math.max(0, target - 24),
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    })
  }, [ui.focusKey, scale, renderInline, contentHeight])
  const fallbackHeight = Math.round(Math.max(paneSize.height, 640) / scale)
  const frameHeight = contentHeight ?? fallbackHeight

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-2 py-2 dark:border-gray-800">
        {showDeviceToggle ? (
          <SegmentedControl
            label="Preview width"
            value={device}
            onChange={onDeviceChange}
            size="sm"
            options={[
              {
                value: 'desktop',
                srLabel: 'Desktop width',
                title: 'Desktop — 1440px, scaled to fit',
                label: (
                  <>
                    <ComputerDesktopIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">Desktop</span>
                  </>
                ),
              },
              {
                value: 'mobile',
                srLabel: 'Mobile width',
                title: 'Mobile — 390px, actual size',
                label: (
                  <>
                    <DevicePhoneMobileIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">Mobile</span>
                  </>
                ),
              },
            ]}
          />
        ) : null}

        <SegmentedControl
          label="Preview colour scheme"
          value={ui.scheme}
          onChange={onSchemeChange}
          size="sm"
          options={[
            {
              value: 'light',
              srLabel: 'Light',
              label: <SunIcon className="h-4 w-4" />,
            },
            {
              value: 'dark',
              srLabel: 'Dark',
              label: <MoonIcon className="h-4 w-4" />,
            },
          ]}
        />

        <SegmentedControl
          label="Preview mode"
          value={ui.mode}
          onChange={onModeChange}
          size="sm"
          options={[
            {
              value: 'design',
              label: 'Design',
              title: 'Sample content fills what you have not added yet',
            },
            {
              value: 'live',
              label: 'Live',
              title: 'Exactly what a visitor gets today',
            },
          ]}
        />

        {/* Below `sm` the label alone wrapped this link onto a third toolbar
            row, costing the preview ~55px of a phone's first screen. Icon-only
            there, with the name carried by `aria-label` — the same shape the
            device toggle above already takes. */}
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          aria-label="Open live site"
          className="ml-auto inline-flex min-h-[32px] items-center gap-1 rounded-md px-2 text-xs font-medium text-gray-600 hover:text-brand-cloud-blue dark:text-gray-300"
        >
          <span className="hidden sm:inline">Open live site</span>
          <ArrowTopRightOnSquareIcon
            className="h-3.5 w-3.5"
            aria-hidden="true"
          />
        </a>
      </div>

      {/* The most consequential sentence on the page ("Nothing here is saved")
          used to be 11px `gray-400` on white — about 2.4:1, well under AA for
          any text, let alone text this small. It is now 12px on a tinted strip
          that also makes the mode perceivable WITHOUT reading twenty words:
          violet for Design (the same hue the rail's sample chips use), green
          for Live. Measured off the rendered DOM: Design 10.4:1 light /
          15.8:1 dark, Live 8.8:1 light / 16.9:1 dark. */}
      <p
        className={
          ui.mode === 'design'
            ? 'flex items-start gap-1.5 border-b border-violet-100 bg-violet-50/70 px-3 py-1.5 text-xs leading-snug text-violet-900 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-100'
            : 'flex items-start gap-1.5 border-b border-green-100 bg-green-50/70 px-3 py-1.5 text-xs leading-snug text-green-900 dark:border-green-900/60 dark:bg-green-950/40 dark:text-green-100'
        }
      >
        {ui.mode === 'design' ? (
          <>
            <SparklesIcon
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <span>
              Design mode — bands with no content yet are filled with
              clearly-marked sample content.{' '}
              <strong className="font-semibold">Nothing here is saved.</strong>
            </span>
          </>
        ) : (
          <>
            <EyeIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Live mode — exactly what a visitor sees today. Empty and hidden
              bands are gone.
            </span>
          </>
        )}
      </p>

      <div
        ref={scrollRef}
        className="min-h-[24rem] flex-1 overflow-auto bg-gray-100 p-4 dark:bg-gray-900"
      >
        <div
          className="mx-auto overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/10 dark:ring-white/10"
          style={{
            width: Math.round(frameWidth * scale),
            height: Math.round(frameHeight * scale),
          }}
        >
          {renderInline ? (
            <div
              ref={inlineRef}
              style={{
                width: frameWidth,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
            >
              {renderInline({
                sections,
                ui,
                onSelect,
                onHover,
              })}
            </div>
          ) : (
            <iframe
              ref={frameRef}
              src={src}
              title="Homepage preview"
              // Same-origin by construction: the composer and the frame speak
              // `postMessage` and the frame needs the organizer's session to
              // load its own data, so no sandbox attribute is applied. The
              // frame's containment (dead links, no analytics, no theme
              // bleed) lives in `PreviewChrome`, inside the document.
              className="block border-0 bg-white"
              style={{
                width: frameWidth,
                height: frameHeight,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
