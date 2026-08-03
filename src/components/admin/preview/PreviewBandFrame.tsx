'use client'

import { Component, type ReactNode } from 'react'
import {
  ArrowTopRightOnSquareIcon,
  ExclamationTriangleIcon,
  EyeSlashIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import type { SectionContentStatus } from '@/lib/homepage/contentStatus'
import type { PreviewMode } from '@/lib/homepage/previewProtocol'

/* -------------------------------------------------------------------------- */
/* Error isolation                                                            */
/* -------------------------------------------------------------------------- */

interface BoundaryProps {
  label: string
  /**
   * Changes on every state push. When it changes, a previously-failed band
   * tries again — so fixing the config that broke a section heals the preview
   * without a reload.
   */
  resetKey: number
  children: ReactNode
}

interface BoundaryState {
  error: Error | null
  resetKey: number
}

/**
 * One error boundary PER BAND.
 *
 * The composer already survives a throwing section — the iframe is a separate
 * document, so the editor shell cannot be taken down by anything the preview
 * renders. What the process boundary does NOT protect is the REST OF THE
 * PREVIEW: without this, one section throwing on a half-typed config would blank
 * the entire page render, and the organizer would lose sight of the twelve bands
 * that are fine along with the one that isn't.
 *
 * Recovery is driven by `resetKey` rather than a "retry" button, because the fix
 * is always the same action — change the config — and that action already
 * produces a state push.
 */
class PreviewBandBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return { error }
  }

  static getDerivedStateFromProps(
    props: BoundaryProps,
    state: BoundaryState,
  ): Partial<BoundaryState> | null {
    if (props.resetKey === state.resetKey) return null
    // A new state push: clear the failure and let the band render again.
    return { error: null, resetKey: props.resetKey }
  }

  componentDidCatch(error: Error) {
    console.error('[homepage-preview] section failed to render:', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="border-y border-red-200 bg-red-50 px-6 py-12 text-center dark:border-red-900/60 dark:bg-red-950/30">
        <ExclamationTriangleIcon
          className="mx-auto h-7 w-7 text-red-500 dark:text-red-400"
          aria-hidden="true"
        />
        <p className="font-space-grotesk mt-3 text-base font-semibold text-red-900 dark:text-red-200">
          {this.props.label} failed to render
        </p>
        <p className="font-inter mx-auto mt-1 max-w-md text-sm text-red-700 dark:text-red-300">
          The rest of the page is unaffected. Adjust this section&apos;s
          settings and the preview will try again.
        </p>
      </div>
    )
  }
}

/* -------------------------------------------------------------------------- */
/* Chips                                                                      */
/* -------------------------------------------------------------------------- */

function Chip({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'amber' | 'slate'
  icon: typeof SparklesIcon
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'font-inter pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm ring-1',
        tone === 'amber'
          ? 'bg-amber-50 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-700'
          : 'bg-white/95 text-gray-700 ring-gray-300 dark:bg-gray-900/95 dark:text-gray-200 dark:ring-gray-600',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {children}
    </span>
  )
}

/** The "add real content ↗" half of a chip, when the status knows where to go. */
function ManageLink({ manage }: { manage: { label: string; href: string } }) {
  return (
    <a
      href={manage.href}
      target="_blank"
      rel="noreferrer"
      // Dead inside the preview like every other anchor (PreviewChrome cancels
      // it); the composer rail carries the working link. Kept as an anchor so
      // the affordance reads correctly and copy-link works.
      className="inline-flex items-center gap-0.5 underline decoration-dotted underline-offset-2"
    >
      {manage.label}
      <ArrowTopRightOnSquareIcon className="h-3 w-3" aria-hidden="true" />
    </a>
  )
}

/* -------------------------------------------------------------------------- */
/* The frame                                                                  */
/* -------------------------------------------------------------------------- */

export interface PreviewBandFrameProps {
  /** The section's stable `_key` — the id both documents address it by. */
  sectionKey: string
  /** Human label, e.g. "Featured Speakers". */
  label: string
  mode: PreviewMode
  /** The eye toggle is off for this section. */
  hidden?: boolean
  /** This band is standing on sample content in Design mode. */
  sample?: boolean
  /**
   * What the LIVE site does with this band — computed against the organizer's
   * REAL conference, never the placeholder-filled copy, so the reason text
   * ("no speakers yet") tells the truth in both modes.
   */
  status?: SectionContentStatus
  /**
   * TRUE when the band renders nothing even WITH placeholders (a rich-text
   * block with no body, a CTA banner with no label). Design mode shows a plate
   * in its place so the section does not simply vanish from the canvas.
   */
  emptyInPreview?: boolean
  focused?: boolean
  hovered?: boolean
  resetKey?: number
  onSelect?: (key: string) => void
  onHover?: (key: string | null) => void
  children: ReactNode
}

/**
 * One band of the previewed page, wrapped in exactly enough chrome to make it
 * addressable and honest — and nothing that changes how the section itself
 * lays out.
 *
 * The frame is what buys per-band badges, ghosting, click-to-focus and error
 * isolation WITHOUT touching `HomepageSectionRenderer` or any section
 * component: the preview renders the renderer once per section rather than once
 * for the list. That is the whole reason this file exists — the renderer and the
 * section components are being edited by other branches, and this batch must not
 * appear in their diffs.
 *
 * LAYOUT NEUTRALITY: the outlines are `outline`, not `border` or `ring` with
 * offset, and the chips are absolutely positioned. Nothing here occupies flow
 * space, so a band measures the same in the preview as on the live site.
 */
export function PreviewBandFrame({
  sectionKey,
  label,
  mode,
  hidden = false,
  sample = false,
  status,
  emptyInPreview = false,
  focused = false,
  hovered = false,
  resetKey = 0,
  onSelect,
  onHover,
  children,
}: PreviewBandFrameProps) {
  const design = mode === 'design'
  const ghosted = design && hidden
  const showsSampleChip = design && sample
  const showsDegradedChip =
    design && !sample && status?.kind === 'degraded' && !emptyInPreview

  return (
    <div
      data-preview-band={sectionKey}
      data-preview-band-label={label}
      className={cn(
        'relative scroll-mt-4',
        // Locate affordances. Present in BOTH modes: they only exist while the
        // organizer is pointing at something, so Live mode is still "what a
        // visitor gets" the moment the pointer leaves.
        focused && 'outline-2 outline-offset-[-2px] outline-blue-500',
        !focused &&
          hovered &&
          'outline-2 outline-offset-[-2px] outline-blue-300',
        showsSampleChip &&
          !focused &&
          'outline-2 outline-offset-[-2px] outline-amber-400 outline-dashed',
      )}
      onClick={onSelect ? () => onSelect(sectionKey) : undefined}
      onMouseEnter={onHover ? () => onHover(sectionKey) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
    >
      {(showsSampleChip || ghosted || showsDegradedChip) && (
        <div className="pointer-events-none absolute top-3 right-3 z-30 flex flex-wrap items-center justify-end gap-1.5">
          {ghosted && (
            <Chip tone="slate" icon={EyeSlashIcon}>
              Hidden
            </Chip>
          )}
          {showsSampleChip && (
            <Chip tone="amber" icon={SparklesIcon}>
              Sample content
              {status?.manage ? (
                <>
                  {' — '}
                  <ManageLink manage={status.manage} />
                </>
              ) : null}
            </Chip>
          )}
          {showsDegradedChip && (
            <Chip tone="amber" icon={ExclamationTriangleIcon}>
              {status?.summary ?? 'Needs content'}
              {status?.manage ? (
                <>
                  {' — '}
                  <ManageLink manage={status.manage} />
                </>
              ) : null}
            </Chip>
          )}
        </div>
      )}

      <div
        className={cn(
          ghosted && 'pointer-events-none opacity-40 grayscale',
          // A band that will not render anything is still SELECTABLE, so the
          // organizer can click the plate and land on its config.
          emptyInPreview && design && 'pointer-events-auto',
        )}
      >
        <PreviewBandBoundary label={label} resetKey={resetKey}>
          {design && emptyInPreview ? (
            <EmptyBandPlate label={label} status={status} />
          ) : (
            children
          )}
        </PreviewBandBoundary>
      </div>
    </div>
  )
}

/**
 * What Design mode shows where the live site shows nothing at all.
 *
 * The alternative — omitting the band — is what today's editor does, and it is
 * the subtle half of the empty-homepage problem: an organizer adds a section,
 * sees no change, and cannot tell whether they mis-configured it or whether the
 * site simply has no content behind it. The plate names the section, states the
 * consequence in the renderer's own terms, and points at the page that fixes it.
 */
function EmptyBandPlate({
  label,
  status,
}: {
  label: string
  status?: SectionContentStatus
}) {
  return (
    <div className="border-y border-dashed border-amber-300 bg-amber-50/60 px-6 py-12 text-center dark:border-amber-800 dark:bg-amber-950/20">
      <p className="font-space-grotesk text-base font-semibold text-amber-900 dark:text-amber-100">
        {label} — not shown on the live site
      </p>
      <p className="font-inter mx-auto mt-1 max-w-md text-sm text-amber-800 dark:text-amber-200">
        {status?.reason ??
          'This block has no content behind it yet, so visitors see nothing here.'}
      </p>
      {status?.manage && (
        <p className="font-inter mt-3 text-sm font-semibold text-amber-900 dark:text-amber-100">
          <ManageLink manage={status.manage} />
        </p>
      )}
    </div>
  )
}
