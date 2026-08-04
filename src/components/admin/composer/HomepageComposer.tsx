'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { AdminButton } from '@/components/admin/AdminButton'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { useNotification } from '@/components/admin/NotificationProvider'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import type { Conference } from '@/lib/conference/types'
import {
  isRichTextContentEmpty,
  sanitizeRichTextContent,
  RICH_TEXT_OBJECT_LABELS,
  type HomepageSection,
  type HomepageSectionType,
  type RichTextContentBlock,
} from '@/lib/homepage'
import {
  sectionContentStatus,
  type SectionContentStatus,
} from '@/lib/homepage/contentStatus'
import {
  isConfigurable,
  moveByIndex,
  nextKey,
  reorderByKey,
  resolveRowsForSave,
  serializeRows,
  toEditorRows,
  toPayload,
  toSections,
  type EditorRow,
} from '@/lib/homepage/editor'
import {
  needsPlaceholderFaqItems,
  withPlaceholders,
} from '@/lib/homepage/placeholders'
import type {
  PreviewColorScheme,
  PreviewDevice,
  PreviewMode,
  PreviewUiState,
} from '@/lib/homepage/previewProtocol'
import { api } from '@/lib/trpc/client'
import { cn } from '@/lib/utils'
import { ComposerRail } from './ComposerRail'
import { PreviewPane, type PreviewPaneProps } from './PreviewPane'
import { SegmentedControl } from './SegmentedControl'

/** Where the workspace returns to — the card it was launched from. */
const APPEARANCE_HREF = '/admin/settings/appearance#homepage'

const NO_TYPES: ReadonlySet<HomepageSectionType> = new Set()

/**
 * The card name an organizer sees in the Rich Text editor, used to point at the
 * one that is still unfinished. `undefined` only if a block was dropped for a
 * reason its `_type` does not name — the generic word still reads correctly.
 */
function richTextCardLabel(block: RichTextContentBlock | undefined): string {
  if (!block || block._type === 'block') return 'Text'
  return RICH_TEXT_OBJECT_LABELS[block._type]
}

export interface HomepageComposerProps {
  /** Stored sections, or the computed default when none are stored yet. */
  initialSections: HomepageSection[]
  /** True when the conference has no stored composition (rendering the default). */
  usingDefault: boolean
  /** `?section=<_key>` — focuses and opens that section's config on load. */
  initialSectionKey?: string
  /** Passed through to the pane; stories render the preview inline. */
  renderInlinePreview?: PreviewPaneProps['renderInline']
  previewSrc?: string
}

/**
 * The homepage composer — the front page being edited beside the front page
 * being rendered.
 *
 * ## Why this is a route and not a modal
 *
 * A 26rem config rail beside a desktop-true page render does not fit in a
 * `max-w-4xl` dialog, and the surface is a place an organizer stays for twenty
 * minutes rather than a field they change and dismiss. It is the one appearance
 * surface that earns a full page; everything else on that page stays inline.
 * The old `HomepageSectionsEditor` modal is gone rather than kept as a second
 * host — two hosts for one 1,200-line editor is a drift machine.
 *
 * ## The two panes, and what each is allowed to do
 *
 * **Left** is the section list and its per-type forms — reorder, hide, add,
 * remove, configure. **Right** is the real page: the same components the tenant
 * site renders, in an iframe, fed the SAME serialization the Save path sends.
 *
 * Direct manipulation in the preview covers exactly the questions the canvas
 * can answer better than a form — *which* section, *where*, *visible or not*,
 * *which variant*: click a band to select its card, hover either side to locate
 * the other, drag in the rail and watch the bands move mid-drag. Text editing
 * stays in the rail: an editable twin of thirteen section types would forfeit
 * the byte-identical render that makes the preview worth believing.
 *
 * ## The invariant that outranks the layout
 *
 * `save()` resolves the rows ONCE and hands the same array to the validator and
 * to `toPayload`. The preview is fed `toSections(resolveRowsForSave(rows))` —
 * the same pipeline — so a band the payload builder drops is missing from the
 * preview too, and the organizer is never shown a page the save would not
 * produce. (An earlier version of this editor validated the sanitized content
 * and sent the raw content; that is what this shape exists to prevent.)
 */
export function HomepageComposer({
  initialSections,
  usingDefault,
  initialSectionKey,
  renderInlinePreview,
  previewSrc,
}: HomepageComposerProps) {
  const router = useRouter()
  const utils = api.useUtils()
  const { showNotification } = useNotification()

  // Rows are materialized ONCE: `toEditorRows` generates keys for keyless
  // stored sections, so a second call would mint DIFFERENT keys — the dirty
  // baseline must be derived from this same array or the workspace would read
  // as dirty the moment it opens.
  const [initialRows, setInitialRows] = useState<EditorRow[]>(() =>
    toEditorRows(initialSections),
  )
  const [rows, setRows] = useState<EditorRow[]>(initialRows)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() =>
    initialSectionKey ? new Set([initialSectionKey]) : new Set(),
  )
  const [confirmingRevert, setConfirmingRevert] = useState(false)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  /** A guarded in-app navigation, waiting on the organizer's answer. */
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  // Live drag state: the id being dragged and the id it is currently over, used
  // to PROJECT the in-progress order into the preview — bands reorder under the
  // cursor mid-drag rather than after the drop.
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)

  const [focusKey, setFocusKey] = useState<string | null>(
    initialSectionKey ?? null,
  )
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [mode, setMode] = useState<PreviewMode>('design')
  const [scheme, setScheme] = useState<PreviewColorScheme>('light')
  const [device, setDevice] = useState<PreviewDevice>('desktop')
  const [pane, setPane] = useState<'compose' | 'preview'>('compose')

  // Two panes need ~1000px before both are useful; below that they become one
  // pane and a segmented toggle. `true` as the SSR default keeps wide screens
  // from flashing the single-pane layout.
  const isWide = useMediaQuery('(min-width: 1024px)', true)

  /**
   * Reference time for the status predicates and the placeholder dates, pinned
   * once per mount. A clock that moved between renders would make the rail's
   * "sample data" tags disagree with the preview's chips for one frame each
   * time either re-rendered.
   */
  const [mountedAt] = useState(() => Date.now())

  const initialSignature = useMemo(
    () => serializeRows(initialRows),
    [initialRows],
  )
  const isDirty = useMemo(
    () => serializeRows(rows) !== initialSignature,
    [rows, initialSignature],
  )

  /**
   * The tenant's real content, for the rail's status rows and sample tags.
   *
   * The frame fetches this too. That is deliberate: two small admin-only reads
   * cost less than a cross-document cache, and the alternative — passing the
   * conference down from the server page — would have to be kept in sync with
   * whatever the preview's own query returns.
   */
  const { data: previewData } = api.conference.homepagePreviewData.useQuery(
    undefined,
    { staleTime: 0, refetchOnWindowFocus: false },
  )
  const conference: Conference | undefined = previewData?.conference

  const mutation = api.conference.updateHomepageSections.useMutation({
    onSuccess: () => {
      void utils.invalidate()
      router.refresh()
      showNotification({
        type: 'success',
        title: 'Homepage updated',
        message: 'Section composition saved.',
      })
    },
    onError: (error) => {
      setSubmitError(error.message || 'Failed to save. Please try again.')
      showNotification({
        type: 'error',
        title: 'Could not save',
        message: error.message || 'Failed to save homepage sections.',
      })
    },
  })

  // --- the composition, as the preview and the save path both see it -------

  // While dragging, the preview shows the PROJECTED order (active over target);
  // otherwise the committed one.
  const previewRows = useMemo(
    () => (activeKey ? reorderByKey(rows, activeKey, overKey) : rows),
    [rows, activeKey, overKey],
  )
  const previewSections = useMemo(
    () => toSections(resolveRowsForSave(previewRows)),
    [previewRows],
  )
  const ui: PreviewUiState = useMemo(
    () => ({ mode, scheme, focusKey, hoverKey }),
    [mode, scheme, focusKey, hoverKey],
  )

  const statuses = useMemo(() => {
    const map = new Map<string, SectionContentStatus>()
    if (!conference) return map
    for (const section of previewSections) {
      map.set(
        section._key,
        sectionContentStatus(section, conference, { now: mountedAt }),
      )
    }
    return map
  }, [previewSections, conference, mountedAt])

  // Which types Design mode is standing on sample content — computed from the
  // same function the preview uses, so a card's "Sample data" tag and a band's
  // amber chip can never disagree.
  const placeholderTypes = useMemo(
    () =>
      conference && mode === 'design'
        ? withPlaceholders(conference, { now: mountedAt }).placeholderTypes
        : NO_TYPES,
    [conference, mode, mountedAt],
  )
  const sampleKeys = useMemo(() => {
    const keys = new Set<string>()
    if (mode !== 'design') return keys
    for (const section of previewSections) {
      if (
        placeholderTypes.has(section._type) ||
        needsPlaceholderFaqItems(section)
      ) {
        keys.add(section._key)
      }
    }
    return keys
  }, [previewSections, placeholderTypes, mode])

  // --- editing --------------------------------------------------------------

  const patchRow = useCallback(
    (key: string, patch: Partial<EditorRow>) =>
      setRows((prev) =>
        prev.map((row) => (row._key === key ? { ...row, ...patch } : row)),
      ),
    [],
  )
  const move = useCallback(
    (from: number, to: number) =>
      setRows((prev) => moveByIndex(prev, from, to)),
    [],
  )
  const remove = useCallback((key: string) => {
    setRows((prev) => prev.filter((row) => row._key !== key))
    setExpanded((prev) => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
    setFocusKey((current) => (current === key ? null : current))
  }, [])
  const add = useCallback((type: HomepageSectionType) => {
    const key = nextKey()
    setRows((prev) => [...prev, { _key: key, _type: type }])
    setFocusKey(key)
    // Auto-expand a freshly added configurable block so add → configure flows
    // without a second click.
    if (isConfigurable(type)) {
      setExpanded((prev) => new Set(prev).add(key))
    }
  }, [])
  const toggleExpanded = useCallback(
    (key: string) =>
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      }),
    [],
  )

  /** Selection from the RAIL: ring both sides, do not disturb the panels. */
  const focusFromRail = useCallback((key: string) => setFocusKey(key), [])

  /**
   * Selection from the PREVIEW: the click means "let me edit that", so the
   * card's config opens, the rail scrolls to it, and on a phone the workspace
   * switches back to the Compose pane where that card lives.
   */
  const focusFromPreview = useCallback((key: string) => {
    setFocusKey(key)
    setExpanded((prev) => (prev.has(key) ? prev : new Set(prev).add(key)))
    setPane('compose')
  }, [])

  // Bring the selected card into view. `block: 'nearest'` makes this a no-op
  // when the card is already visible, which is the common case for a rail
  // click — only a selection made in the preview actually scrolls.
  useEffect(() => {
    if (!focusKey || typeof document === 'undefined') return
    const escape = window.CSS?.escape ?? ((value: string) => value)
    const node = document.querySelector(
      `[data-composer-card="${escape(focusKey)}"]`,
    )
    if (!node) return
    const reduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches
    node.scrollIntoView({
      block: 'nearest',
      behavior: reduced ? 'auto' : 'smooth',
    })
  }, [focusKey])

  // --- saving ---------------------------------------------------------------

  /**
   * Validate the rows AS THEY WILL BE SENT. `resolvedRows` is exactly what
   * `save` hands to `toPayload`; `authoredRows` is what the organizer sees. The
   * two are compared so a card the sanitizer dropped is reported, not vanished.
   */
  const validate = (
    authoredRows: EditorRow[],
    resolvedRows: EditorRow[],
  ): string | null => {
    for (const [index, row] of resolvedRows.entries()) {
      if (row._type === 'homepageCtaBanner') {
        if (!row.heading?.trim()) return 'CTA banner needs a heading.'
        if (!row.buttonLabel?.trim()) return 'CTA banner needs a button label.'
        if (!row.buttonHref?.trim()) return 'CTA banner needs a button link.'
      }
      if (row._type === 'homepageRichText') {
        const authored = authoredRows[index].content ?? []
        const kept = row.content ?? []
        // A shorter resolved array means a card was half-finished — an empty
        // code/callout card, an image card with nothing uploaded, an all-blank
        // table. The server would REJECT those outright, and dropping them
        // behind a "saved" toast would be its own quiet data loss, so name the
        // card and make the organizer decide.
        if (kept.length < authored.length) {
          const unfinished = authored.find(
            (block) => sanitizeRichTextContent([block]).length === 0,
          )
          return `Rich text block has an unfinished ${richTextCardLabel(unfinished)} card. Fill it in or remove it.`
        }
        if (kept.length === 0 || isRichTextContentEmpty(kept))
          return 'Rich text block needs content.'
      }
    }
    return null
  }

  const save = () => {
    setSubmitError(null)
    // ONE resolution, used by the validator, the payload AND the new baseline.
    // Validating one array while sending another is the bug this shape makes
    // impossible; sanitizer output is by construction accepted by the mutation
    // schema, so what passes below is what the server takes.
    const resolved = resolveRowsForSave(rows)
    const error = validate(rows, resolved)
    if (error) {
      setSubmitError(error)
      return
    }
    // Saving an EMPTY composition is server-side "unset → revert to default" —
    // route it through the same confirmation as the explicit Revert button
    // rather than silently discarding the stored composition.
    if (rows.length === 0) {
      setConfirmingRevert(true)
      return
    }
    mutation.mutate(
      { homepageSections: toPayload(resolved) as never },
      {
        onSuccess: () => {
          // The baseline becomes what was SENT, not what was typed: the
          // sanitizer may have normalised the rich text, and a baseline of the
          // pre-sanitized rows would leave the workspace dirty right after a
          // successful save.
          setInitialRows(resolved)
          setRows(resolved)
        },
      },
    )
  }

  const revertToDefault = () => {
    setConfirmingRevert(false)
    setSubmitError(null)
    mutation.mutate(
      { homepageSections: [] },
      {
        onSuccess: () => {
          // The stored composition is gone; the page now renders the phase-aware
          // default again, which the server component re-delivers on refresh.
          router.push(APPEARANCE_HREF)
        },
      },
    )
  }

  const leave = useCallback(
    (href: string) => {
      setPendingHref(null)
      router.push(href)
    },
    [router],
  )
  const cancel = () => {
    if (isDirty) {
      setConfirmingCancel(true)
      return
    }
    leave(APPEARANCE_HREF)
  }

  // --- the dirty guard ------------------------------------------------------
  //
  // A workspace is left by navigating, not by dismissing, so the modal's
  // close-path guard becomes a ROUTE-leave guard: `beforeunload` for reloads and
  // external links, plus a capture-phase click interceptor for in-app links
  // (the App Router has no navigation-blocking API, and every in-app
  // destination — the sidebar, ⌘K, the rail's own "add speakers ↗" links — is
  // ultimately an anchor). Modified clicks and new-tab links are left alone:
  // they do not take this document anywhere.
  useEffect(() => {
    if (!isDirty) return

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return
      const target = event.target as Element | null
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null
      if (
        !anchor ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download')
      )
        return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return
      // Same page (an in-page anchor, or the composer's own deep link) is not
      // leaving.
      if (url.pathname === window.location.pathname) return
      event.preventDefault()
      event.stopPropagation()
      setPendingHref(`${url.pathname}${url.search}${url.hash}`)
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [isDirty])

  const railRef = useRef<HTMLDivElement>(null)

  const showRail = isWide || pane === 'compose'
  const showPreview = isWide || pane === 'preview'

  return (
    <div className="space-y-4">
      {/* Two rows rather than one: at 393px a single row truncated the title to
          "Homepage comp…" and orphaned Save onto a line of its own. */}
      <header className="space-y-3">
        <div className="flex items-center gap-3">
          <Link
            href={APPEARANCE_HREF}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-brand-cloud-blue dark:text-gray-400"
          >
            <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
            Appearance
          </Link>
          {isDirty ? (
            <span className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-300">
              <span
                className="h-2 w-2 rounded-full bg-amber-500"
                aria-hidden="true"
              />
              Unsaved changes
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <h1 className="font-space-grotesk text-xl font-bold text-gray-900 dark:text-white">
              Homepage composer
            </h1>
            {/* Two lines of scene-setting on a phone, above a header that
                already costs three rows, pushed the first preview pixel off
                the first screen. It earns its place on a desktop. */}
            <p className="hidden text-sm text-gray-500 sm:block dark:text-gray-400">
              Compose the front page and watch it render as you go.
            </p>
          </div>
          {/* On a phone these wrapped into a ragged stack with Save orphaned on
              a line of its own. A 2-column grid makes that deliberate instead:
              Save full-width on top, the two secondaries side by side beneath.
              Above `sm` it is the ordinary right-aligned row again. */}
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center sm:justify-end">
            <AdminButton
              variant="secondary"
              size="md"
              onClick={() => setConfirmingRevert(true)}
              disabled={mutation.isPending}
              className="order-2 min-h-[44px] sm:order-none"
            >
              Revert to default
            </AdminButton>
            <AdminButton
              variant="secondary"
              size="md"
              onClick={cancel}
              disabled={mutation.isPending}
              className="order-3 min-h-[44px] sm:order-none"
            >
              Cancel
            </AdminButton>
            <AdminButton
              color="blue"
              size="md"
              onClick={save}
              disabled={mutation.isPending}
              className="order-1 col-span-2 min-h-[44px] sm:order-none sm:col-span-1"
            >
              {mutation.isPending ? 'Saving…' : 'Save'}
            </AdminButton>
          </div>
        </div>
      </header>

      {usingDefault ? (
        <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
          You are using the default layout — change anything below to make it
          your own. “Revert to default” brings back the automatic layout that
          adapts as your conference takes shape.
        </p>
      ) : null}

      {submitError ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
        >
          {submitError}
        </p>
      ) : null}

      {/* Below `lg` the panes take turns: two half-width panes on a phone would
          make both useless. */}
      <SegmentedControl
        label="Workspace pane"
        value={pane}
        onChange={setPane}
        className="lg:hidden"
        options={[
          { value: 'compose', label: 'Compose' },
          { value: 'preview', label: 'Preview' },
        ]}
      />

      <div className="flex flex-col gap-4 lg:h-[calc(100vh-16rem)] lg:min-h-[38rem] lg:flex-row">
        {showRail ? (
          <div
            ref={railRef}
            className={cn(
              'min-w-0 lg:w-[26rem] lg:shrink-0 lg:overflow-y-auto lg:pr-1',
            )}
          >
            <ComposerRail
              rows={rows}
              expanded={expanded}
              focusKey={focusKey}
              hoverKey={hoverKey}
              statuses={statuses}
              sampleKeys={sampleKeys}
              onAdd={add}
              onToggleExpanded={toggleExpanded}
              onPatch={patchRow}
              onToggleHidden={(key) => {
                const row = rows.find((candidate) => candidate._key === key)
                patchRow(key, { hidden: !row?.hidden })
              }}
              onMove={move}
              onRemove={remove}
              onFocus={focusFromRail}
              onHover={setHoverKey}
              activeKey={activeKey}
              onDragStart={(key) => {
                setActiveKey(key)
                setOverKey(key)
              }}
              onDragOver={setOverKey}
              onDragEnd={(active, over) => {
                setActiveKey(null)
                setOverKey(null)
                if (!over || active === over) return
                setRows((prev) => reorderByKey(prev, active, over))
              }}
              onDragCancel={() => {
                setActiveKey(null)
                setOverKey(null)
              }}
            />
          </div>
        ) : null}

        {showPreview ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
            <PreviewPane
              sections={previewSections}
              ui={ui}
              // On a phone the preview is a phone: the desktop frame would be a
              // 27%-scale thumbnail, which answers no question.
              device={isWide ? device : 'mobile'}
              showDeviceToggle={isWide}
              onDeviceChange={setDevice}
              onModeChange={setMode}
              onSchemeChange={setScheme}
              onSelect={focusFromPreview}
              onHover={setHoverKey}
              src={previewSrc}
              renderInline={renderInlinePreview}
            />
          </div>
        ) : null}
      </div>

      <ConfirmationModal
        isOpen={confirmingRevert}
        onClose={() => setConfirmingRevert(false)}
        onConfirm={revertToDefault}
        title="Revert to default layout?"
        message="This clears the layout you have saved and brings back the automatic homepage that adapts as your conference takes shape. This cannot be undone."
        confirmButtonText="Revert to default"
        variant="warning"
        isLoading={mutation.isPending}
      />

      <ConfirmationModal
        isOpen={confirmingCancel}
        onClose={() => setConfirmingCancel(false)}
        onConfirm={() => {
          setConfirmingCancel(false)
          leave(APPEARANCE_HREF)
        }}
        title="Discard unsaved changes?"
        message="Your homepage composition changes have not been saved."
        confirmButtonText="Discard changes"
        variant="warning"
      />

      <ConfirmationModal
        isOpen={pendingHref !== null}
        onClose={() => setPendingHref(null)}
        onConfirm={() => (pendingHref ? leave(pendingHref) : undefined)}
        title="Leave the composer?"
        message="Your homepage composition changes have not been saved."
        confirmButtonText="Leave without saving"
        variant="warning"
      />
    </div>
  )
}
