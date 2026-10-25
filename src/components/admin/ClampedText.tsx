'use client'

import { useEffect, useId, useRef, useState } from 'react'

/**
 * Plain text clamped to three lines with a Show more / Show less toggle. The
 * toggle only appears when the text actually overflows the clamp. Text is a
 * React child, so it is escaped — callers strip any markup first.
 */
export function ClampedText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const ref = useRef<HTMLParagraphElement>(null)
  const id = useId()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () =>
      // Measured only while clamped; once expanded the toggle must stay.
      !expanded && setOverflows(el.scrollHeight > el.clientHeight + 1)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [expanded, text])

  return (
    <div>
      <p
        id={id}
        ref={ref}
        className={`whitespace-pre-line ${expanded ? '' : 'line-clamp-3'}`}
      >
        {text}
      </p>
      {overflows ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </div>
  )
}
