'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { ChevronDownIcon } from '@heroicons/react/24/outline'
import { hashTargetsWithin } from '@/lib/settings/groups'
import { GroupTitleContext, useSettingsQuery } from './SettingsFilter'

const LG = '(min-width: 1024px)'

/**
 * A Settings tier-1 group as a disclosure. Collapsed to its header row (title
 * plus a one-line summary) below lg, expanded from lg up. A deep link to the
 * group or to any card inside it (`#identity-brand`, `#visibility`) opens the
 * group and scrolls to the target, on load and on later hash changes.
 */
export function CollapsibleGroup({
  id,
  title,
  description,
  icon,
  children,
}: {
  id: string
  title: string
  description: string
  /** Rendered icon element: a component function cannot cross the RSC boundary. */
  icon: ReactNode
  children: ReactNode
}) {
  // null until mounted: the server cannot know the viewport, so CSS decides
  // (hidden below lg) until the effect below picks a real state.
  const [open, setOpen] = useState<boolean | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const contentId = useId()
  const descriptionId = useId()
  // While filtering, every group with a match is shown expanded and the
  // toggle is disabled (collapsing would hide the matches being looked for).
  const filtering = useSettingsQuery().trim() !== ''

  useEffect(() => {
    const root = ref.current
    if (!root) return
    const openForHash = () => {
      if (!hashTargetsWithin(root, window.location.hash)) return false
      // The target had no layout while collapsed, so the browser's own jump
      // went nowhere. Commit the open state synchronously, then scroll.
      flushSync(() => setOpen(true))
      document
        .getElementById(decodeURIComponent(window.location.hash.slice(1)))
        ?.scrollIntoView()
      return true
    }
    if (!openForHash()) setOpen(window.matchMedia(LG).matches)
    window.addEventListener('hashchange', openForHash)
    return () => window.removeEventListener('hashchange', openForHash)
  }, [])

  const expanded = filtering || open
  const hiddenClass =
    expanded === null ? 'max-lg:hidden' : expanded ? '' : 'hidden'

  return (
    // A group with no visible card (the filter hid them all) hides itself.
    <div
      id={id}
      ref={ref}
      className="scroll-mt-44 space-y-4 [&:not(:has([data-settings-card]:not([hidden])))]:hidden"
    >
      <div>
        <h3>
          <button
            type="button"
            aria-expanded={expanded ?? undefined}
            disabled={filtering}
            aria-controls={contentId}
            aria-describedby={descriptionId}
            onClick={() => setOpen(!(open ?? window.matchMedia(LG).matches))}
            className="flex w-full min-w-0 items-center gap-2 text-left"
          >
            <span className="shrink-0 text-gray-400 dark:text-gray-500 [&>svg]:h-5 [&>svg]:w-5">
              {icon}
            </span>
            <span className="min-w-0 flex-1 text-lg font-semibold text-gray-900 dark:text-white">
              {title}
            </span>
            <ChevronDownIcon
              aria-hidden="true"
              className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${expanded === null ? 'lg:rotate-180' : expanded ? 'rotate-180' : ''}`}
            />
          </button>
        </h3>
        {/* Outside the button: the heading's name is the title alone; the
            summary is attached to the toggle as its description. */}
        <p
          id={descriptionId}
          className={`mt-1 pl-7 text-sm text-gray-500 dark:text-gray-400 ${expanded ? '' : 'line-clamp-1 lg:line-clamp-none'}`}
        >
          {description}
        </p>
      </div>
      <div
        id={contentId}
        className={`grid grid-cols-1 gap-6 lg:grid-cols-2 ${hiddenClass}`}
      >
        <GroupTitleContext.Provider value={title}>
          {children}
        </GroupTitleContext.Provider>
      </div>
    </div>
  )
}
