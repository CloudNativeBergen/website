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
      <div
        className={clsx(
          'text-base leading-7',
          !isExpanded && 'line-clamp-6', // Show 5-6 lines initially
        )}
      >
        {children}
      </div>
      <button
        type="button"
        className="mt-3 cursor-pointer text-sm font-medium text-brand-cloud-blue underline transition-colors hover:text-brand-cloud-blue/80 active:text-brand-cloud-blue/90"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? 'Show less' : 'Show more'}
      </button>
    </section>
  )
}
