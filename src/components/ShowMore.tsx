'use client'

import clsx from 'clsx'
import { useState } from 'react'

export interface AboutSectionProps
  extends React.ComponentPropsWithoutRef<'section'> {
  text: string
}
export function ShowMore({
  children,
  ...props
}: React.ComponentPropsWithoutRef<'section'>) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <section {...props}>
      <span
        className={clsx(
          'mt-2 text-base leading-7 text-slate-700',
          !isExpanded && 'lg:line-clamp-4',
        )}
      >
        {children}
      </span>
      <button
        type="button"
        className="mt-2 cursor-pointer text-sm font-medium text-indigo-600 underline hover:text-indigo-800 active:text-indigo-900"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? 'Show less' : 'Show more'}
      </button>
    </section>
  )
}
