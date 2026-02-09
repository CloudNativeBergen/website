'use client'

import { useState } from 'react'
import { ChevronDownIcon } from '@heroicons/react/24/outline'

export function CollapsibleDescription({
  paragraphs,
}: {
  paragraphs: string[]
}) {
  const [expanded, setExpanded] = useState(false)

  if (paragraphs.length <= 1) {
    return (
      <div className="font-inter mt-6 space-y-6 text-2xl tracking-tight text-brand-slate-gray dark:text-gray-300">
        {paragraphs.map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>
    )
  }

  return (
    <div className="font-inter mt-6 space-y-6 text-2xl tracking-tight text-brand-slate-gray dark:text-gray-300">
      <p>{paragraphs[0]}</p>
      <div className={expanded ? 'block' : 'hidden sm:block'}>
        {paragraphs.slice(1).map((line, index) => (
          <p key={index + 1} className={index > 0 ? 'mt-6' : ''}>
            {line}
          </p>
        ))}
      </div>
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-1 text-base font-medium text-brand-cloud-blue hover:text-brand-cloud-blue/80 sm:hidden"
        >
          Show more
          <ChevronDownIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
