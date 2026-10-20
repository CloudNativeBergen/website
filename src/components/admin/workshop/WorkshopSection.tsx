'use client'

import {
  useId,
  type ComponentType,
  type ReactNode,
  type Ref,
  type SVGProps,
} from 'react'
import { ChevronDownIcon } from '@heroicons/react/24/outline'

export interface WorkshopSectionProps {
  /** The section's anchor, for links to it. */
  id?: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  /** Sentence case. */
  title: ReactNode
  /** One line: what the section is for. Shown also while collapsed. */
  description?: ReactNode
  /** Beside the title (a status badge). Inside the toggle when collapsible. */
  badge?: ReactNode
  /** On the right, outside the toggle (an edit button). */
  action?: ReactNode
  headingId?: string
  /**
   * Focus lands on the heading when the control that held it leaves the
   * page. Focusable from code only.
   */
  headingRef?: Ref<HTMLHeadingElement>
  focusableHeading?: boolean
  /**
   * Collapsible when set: whether the content is shown. A button inside the
   * heading, not <summary>, which would hide the heading from screen-reader
   * heading navigation.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Amber, for the "Needs attention" section. */
  tone?: 'default' | 'attention'
  children?: ReactNode
}

/**
 * THE CARD EVERY SECTION OF `/admin/workshops` SITS IN (#1452): icon, a
 * sentence-case h3 and one line of description, then the content.
 */
export function WorkshopSection({
  id,
  icon: Icon,
  title,
  description,
  badge,
  action,
  headingId,
  headingRef,
  focusableHeading = false,
  open,
  onOpenChange,
  tone = 'default',
  children,
}: WorkshopSectionProps) {
  const generatedId = useId()
  const contentId = useId()
  const labelId = headingId ?? generatedId
  const collapsible = open !== undefined
  const attention = tone === 'attention'

  return (
    <section
      id={id}
      aria-labelledby={labelId}
      className={`scroll-mt-24 rounded-lg p-6 shadow-sm ring-1 ${
        attention
          ? 'bg-amber-50 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900'
          : 'bg-white ring-gray-200 dark:bg-gray-900 dark:ring-gray-700'
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon
          aria-hidden
          className={`size-5 shrink-0 ${
            attention
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-gray-400 dark:text-gray-500'
          }`}
        />
        <h3
          ref={headingRef}
          id={labelId}
          tabIndex={focusableHeading || headingRef ? -1 : undefined}
          className={`min-w-0 flex-1 text-lg font-medium outline-none ${
            attention
              ? 'text-amber-900 dark:text-amber-100'
              : 'text-gray-900 dark:text-white'
          }`}
        >
          {collapsible ? (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={contentId}
              onClick={() => onOpenChange?.(!open)}
              className="flex w-full flex-wrap items-center gap-2 text-left"
            >
              {title}
              {badge}
              <ChevronDownIcon
                aria-hidden
                className={`ml-auto size-5 shrink-0 text-gray-400 transition-transform dark:text-gray-500 ${open ? 'rotate-180' : ''}`}
              />
            </button>
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              {title}
              {badge}
            </span>
          )}
        </h3>
        {action}
      </div>
      {description && (
        <p
          className={`mt-1 text-sm ${
            attention
              ? 'text-amber-800 dark:text-amber-300'
              : 'text-gray-600 dark:text-gray-400'
          }`}
        >
          {description}
        </p>
      )}
      {collapsible ? (
        <div id={contentId} className={open ? undefined : 'hidden'}>
          {children}
        </div>
      ) : (
        children
      )}
    </section>
  )
}
