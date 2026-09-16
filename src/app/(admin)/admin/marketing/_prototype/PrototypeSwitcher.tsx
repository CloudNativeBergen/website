'use client'
/** PROTOTYPE — floating variant switcher. Dev builds only. */
import { useEffect } from 'react'

export function PrototypeSwitcher({
  variants,
  current,
  name,
  onChange,
}: {
  variants: string[]
  current: string
  name: string
  onChange: (v: string) => void
}) {
  const i = Math.max(0, variants.indexOf(current))
  const go = (d: number) =>
    onChange(variants[(i + d + variants.length) % variants.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        (el as HTMLElement | null)?.isContentEditable
      )
        return
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (process.env.NODE_ENV === 'production') return null

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-gray-900 px-2 py-1.5 text-white shadow-xl ring-1 ring-black/20">
      <button
        onClick={() => go(-1)}
        aria-label="Previous variant"
        className="rounded-full px-2 py-1 hover:bg-white/15"
      >
        ←
      </button>
      <span className="px-2 text-xs font-semibold tracking-wide">
        PROTOTYPE · {current}{' '}
        <span className="font-normal opacity-70">({name})</span>
      </span>
      <button
        onClick={() => go(1)}
        aria-label="Next variant"
        className="rounded-full px-2 py-1 hover:bg-white/15"
      >
        →
      </button>
    </div>
  )
}
