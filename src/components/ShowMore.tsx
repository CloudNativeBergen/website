'use client'

import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'

export function ShowMore({
  children,
  ...props
}: React.ComponentPropsWithoutRef<'section'>) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [needsExpansion, setNeedsExpansion] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (contentRef.current) {
      const hasOverflow =
        contentRef.current.scrollHeight > contentRef.current.clientHeight
      setNeedsExpansion(hasOverflow)
    }
  }, [children])

  return (
    <section {...props}>
      <div
        ref={contentRef}
        className={clsx('text-base leading-7', !isExpanded && 'line-clamp-6')}
      >
        {children}
      </div>
      {needsExpansion && (
        <button
          type="button"
          className="mt-3 cursor-pointer text-sm font-medium text-brand-cloud-blue underline transition-colors hover:text-brand-cloud-blue/80 active:text-brand-cloud-blue/90"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </section>
  )
}
