'use client'

import { useEffect, useState } from 'react'
import { Container } from '@/components/Container'
import { resolveVariant, type SectionVariant } from '@/lib/homepage/variants'

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

function Unit({
  value,
  label,
  compact = false,
}: {
  value: string
  label: string
  /**
   * Embedded inside another card rather than owning a full-width section. The
   * standalone size overflows its column on a 393px viewport once the day count
   * reaches three digits — which is the NORMAL case for a save-the-date band.
   */
  compact?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col items-center">
      <span
        className={
          compact
            ? 'font-space-grotesk text-2xl font-bold text-brand-slate-gray tabular-nums sm:text-4xl dark:text-gray-100'
            : 'font-space-grotesk text-4xl font-bold text-brand-slate-gray tabular-nums sm:text-6xl dark:text-gray-100'
        }
        aria-hidden={value === '--'}
      >
        {value}
      </span>
      <span
        className={
          compact
            ? 'font-inter mt-1 text-[10px] font-medium tracking-wide text-brand-slate-gray/60 uppercase sm:text-xs dark:text-gray-400'
            : 'font-inter mt-1 text-xs font-medium tracking-wide text-brand-slate-gray/60 uppercase sm:text-sm dark:text-gray-400'
        }
      >
        {label}
      </span>
    </div>
  )
}

/**
 * Milliseconds remaining until `targetMs`, or `null` until the client has
 * measured. Server render and first client render both see `null` — see the
 * SSR-safety note on this module.
 */
function useCountdownRemaining(targetMs: number): number | null {
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

  return remaining
}

/** The bare d/h/m/s grid, with no section chrome. */
function CountdownUnits({
  remaining,
  compact = false,
  className = 'mx-auto grid max-w-2xl grid-cols-4 gap-4 sm:gap-8',
}: {
  remaining: number | null
  compact?: boolean
  className?: string
}) {
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
    <div className={className} role="timer" aria-live="off">
      {units.map((u) => (
        <Unit key={u.label} value={u.value} label={u.label} compact={compact} />
      ))}
    </div>
  )
}

/**
 * The countdown grid WITHOUT the section wrapper, for embedding inside another
 * band (the save-the-date block). Hides itself once the target has passed —
 * a counter reading all zeros on a finished event is exactly the kind of
 * undefined empty state this work exists to remove.
 */
export function CountdownStrip({ targetMs }: { targetMs: number }) {
  const remaining = useCountdownRemaining(targetMs)
  if (remaining !== null && remaining <= 0) return null
  return (
    <CountdownUnits
      remaining={remaining}
      compact
      className="mx-auto grid max-w-md grid-cols-4 gap-2 sm:gap-5"
    />
  )
}

/** The tinted slim band the `strip` variant lives in, light and dark. */
const stripBandClass =
  'flex flex-wrap items-baseline justify-center gap-x-4 gap-y-2 rounded-xl border border-brand-cloud-blue/10 bg-brand-cloud-blue/5 px-5 py-4 sm:px-8 dark:border-blue-900/60 dark:bg-blue-950/40'

/**
 * The countdown on ONE line: `12 days 03 hours 41 minutes 08 seconds`.
 *
 * The unit words are spelt out rather than abbreviated to `d/h/m/s`. A single
 * line is already terse; a row of one-letter suffixes reads as a serial number,
 * and it is the only text a screen reader gets — the four-tile grid at least
 * pairs each number with a visible label.
 */
function CountdownInline({ remaining }: { remaining: number | null }) {
  const parts = remaining === null ? null : countdownBreakdown(remaining)
  const units: { label: string; value: string }[] = [
    { label: 'days', value: parts ? String(parts.days) : '--' },
    {
      label: 'hours',
      value: parts ? String(parts.hours).padStart(2, '0') : '--',
    },
    {
      label: 'minutes',
      value: parts ? String(parts.minutes).padStart(2, '0') : '--',
    },
    {
      label: 'seconds',
      value: parts ? String(parts.seconds).padStart(2, '0') : '--',
    },
  ]
  return (
    <p
      /*
       * Sized so all FOUR units fit one line at 393px — the whole point of the
       * variant. A larger phone size wrapped "seconds" onto a second row, which
       * is the units grid again, only ragged.
       */
      className="font-space-grotesk flex flex-wrap items-baseline justify-center gap-x-2.5 text-lg font-bold text-brand-slate-gray tabular-nums sm:gap-x-3 sm:text-3xl dark:text-gray-100"
      role="timer"
      aria-live="off"
    >
      {units.map((u) => (
        <span key={u.label} className="whitespace-nowrap">
          {u.value}
          <span className="font-inter ml-1 text-xs font-medium text-brand-slate-gray/60 sm:text-sm dark:text-gray-400">
            {u.label}
          </span>
        </span>
      ))}
    </p>
  )
}

export function Countdown({
  targetMs,
  heading,
  liveMessage,
  variant,
}: {
  targetMs: number
  heading?: string
  liveMessage?: string
  /**
   * Presentation variant. ABSENT = `units`, the pre-variant rendering, so every
   * existing caller keeps exactly the band it has today.
   */
  variant?: SectionVariant<'homepageCountdown'>
}) {
  const resolved = resolveVariant('homepageCountdown', variant)
  const remaining = useCountdownRemaining(targetMs)
  const isStrip = resolved === 'strip'

  // Post-hydration, once the target has passed. Both variants keep the same
  // rule — show `liveMessage` if there is one, otherwise disappear — because a
  // counter reading all zeros is the empty state this block exists to remove.
  if (remaining !== null && remaining <= 0) {
    if (!liveMessage) return null
    if (isStrip) {
      return (
        <section className="py-8 sm:py-12">
          <Container>
            <div className={stripBandClass}>
              <p className="font-space-grotesk text-xl font-medium tracking-tight text-brand-cloud-blue sm:text-2xl dark:text-blue-400">
                {liveMessage}
              </p>
            </div>
          </Container>
        </section>
      )
    }
    return (
      <section className="py-20 sm:py-32">
        <Container>
          <p className={headingClass}>{liveMessage}</p>
        </Container>
      </section>
    )
  }

  if (isStrip) {
    /*
     * A persistent reminder bar rather than a full-height band: a fraction of
     * the vertical space, so a page can carry the countdown alongside real
     * content instead of choosing between them. The heading sits INLINE with
     * the numbers and wraps under them on a narrow screen.
     */
    return (
      <section className="py-8 sm:py-12">
        <Container>
          <div className={stripBandClass}>
            {heading ? (
              <h2 className="font-space-grotesk text-xl font-medium tracking-tight text-brand-cloud-blue sm:text-2xl dark:text-blue-400">
                {heading}
              </h2>
            ) : null}
            <CountdownInline remaining={remaining} />
          </div>
        </Container>
      </section>
    )
  }

  return (
    <section className="py-20 sm:py-32">
      <Container>
        {heading ? <h2 className={headingClass}>{heading}</h2> : null}
        <CountdownUnits remaining={remaining} />
      </Container>
    </section>
  )
}
