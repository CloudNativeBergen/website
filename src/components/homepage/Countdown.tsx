'use client'

import { useEffect, useState } from 'react'
import { Container } from '@/components/Container'

/**
 * Countdown block (front-page builder F4). SSR-SAFE by construction: the target
 * is resolved server-side (see `resolveCountdownTarget`) and passed in as a plain
 * `targetMs` timestamp. The FIRST render — server and first client render alike —
 * shows a stable placeholder (em-dashes), so there is no `Date.now()` on any
 * server render path and therefore no hydration mismatch. Only after hydration
 * does the effect start reading the clock and ticking once a second.
 *
 * Once the target passes, `liveMessage` is shown if configured; otherwise the
 * block hides itself (the config knob is "leave the message blank to hide").
 */

const MS_PER_DAY = 86_400_000
const MS_PER_HOUR = 3_600_000
const MS_PER_MINUTE = 60_000
const MS_PER_SECOND = 1_000

interface Breakdown {
  days: number
  hours: number
  minutes: number
  seconds: number
}

/** Split a non-negative millisecond remainder into d/h/m/s. */
export function countdownBreakdown(remainingMs: number): Breakdown {
  const total = Math.max(0, remainingMs)
  return {
    days: Math.floor(total / MS_PER_DAY),
    hours: Math.floor((total % MS_PER_DAY) / MS_PER_HOUR),
    minutes: Math.floor((total % MS_PER_HOUR) / MS_PER_MINUTE),
    seconds: Math.floor((total % MS_PER_MINUTE) / MS_PER_SECOND),
  }
}

const headingClass =
  'font-space-grotesk mb-10 text-center text-4xl font-medium tracking-tighter text-brand-cloud-blue sm:text-5xl dark:text-blue-400'

function Unit({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span
        className="font-space-grotesk text-4xl font-bold text-brand-slate-gray tabular-nums sm:text-6xl dark:text-gray-100"
        aria-hidden={value === '--'}
      >
        {value}
      </span>
      <span className="font-inter mt-1 text-xs font-medium tracking-wide text-brand-slate-gray/60 uppercase sm:text-sm dark:text-gray-400">
        {label}
      </span>
    </div>
  )
}

export function Countdown({
  targetMs,
  heading,
  liveMessage,
}: {
  targetMs: number
  heading?: string
  liveMessage?: string
}) {
  // `null` = not yet measured on the client. Server render and the first client
  // render both see `null`, guaranteeing identical markup (the placeholder).
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => {
      const next = Math.max(0, targetMs - Date.now())
      setRemaining(next)
      // Once the target has passed the display is static — stop ticking
      // instead of holding a 1s interval for the rest of the page's life.
      if (next <= 0) clearInterval(id)
    }
    const id = setInterval(tick, 1000)
    tick()
    return () => clearInterval(id)
  }, [targetMs])

  // Post-hydration, once the target has passed.
  if (remaining !== null && remaining <= 0) {
    if (!liveMessage) return null
    return (
      <section className="py-20 sm:py-32">
        <Container>
          <p className={headingClass}>{liveMessage}</p>
        </Container>
      </section>
    )
  }

  const parts = remaining === null ? null : countdownBreakdown(remaining)
  const units: { label: string; value: string }[] = [
    {
      label: 'Days',
      value: parts ? String(parts.days) : '--',
    },
    {
      label: 'Hours',
      value: parts ? String(parts.hours).padStart(2, '0') : '--',
    },
    {
      label: 'Minutes',
      value: parts ? String(parts.minutes).padStart(2, '0') : '--',
    },
    {
      label: 'Seconds',
      value: parts ? String(parts.seconds).padStart(2, '0') : '--',
    },
  ]

  return (
    <section className="py-20 sm:py-32">
      <Container>
        {heading ? <h2 className={headingClass}>{heading}</h2> : null}
        <div
          className="mx-auto grid max-w-2xl grid-cols-4 gap-4 sm:gap-8"
          role="timer"
          aria-live="off"
        >
          {units.map((u) => (
            <Unit key={u.label} value={u.value} label={u.label} />
          ))}
        </div>
      </Container>
    </section>
  )
}
