import { Container } from '@/components/Container'
import { Button } from '@/components/Button'
import { CountdownStrip } from '@/components/homepage/Countdown'
import { resolveCountdownTarget } from '@/lib/homepage/countdown'
import {
  DEFAULT_SAVE_THE_DATE_HEADING,
  type SaveTheDateSection,
} from '@/lib/homepage/sections'
import {
  resolveRoadmapSteps,
  type HomepageLifecycle,
  type RoadmapStep,
} from '@/lib/homepage/lifecycle'
import type { Conference } from '@/lib/conference/types'
import { formatDatesSafe, formatDateSafe } from '@/lib/time'
import {
  CalendarDaysIcon,
  CheckCircleIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline'

/**
 * The DAY-ONE band.
 *
 * A brand-new conference has no speakers, no sponsors, no schedule and no
 * photos, so every content band on the homepage correctly renders nothing —
 * leaving a hero sitting directly on top of a "Become a Sponsor" pitch. That is
 * the state 64% of new community events would land in, and it reads as a broken
 * template rather than an announcement.
 *
 * This band fills it using ONLY what a day-one organizer has already entered:
 * the dates, the city and venue, and whichever of the CFP / programme / ticket
 * dates are configured. Nothing is invented and nothing unknown is rendered —
 * a milestone with no date is omitted (see {@link resolveRoadmapSteps}), and
 * with no milestones at all the band is still a complete save-the-date: dates,
 * place and a live countdown.
 */
export function SaveTheDate({
  section,
  conference,
  lifecycle,
}: {
  section: SaveTheDateSection
  conference: Conference
  lifecycle: HomepageLifecycle
}) {
  const dates = formatDatesSafe(conference.startDate, conference.endDate)
  const place = [conference.venueName, conference.city]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ')

  // Nothing to save the date FOR. Rather than render a heading over an empty
  // card, the band removes itself — the hero already carries the title.
  if (dates === 'TBD' && !place) return null

  const heading = section.heading?.trim() || DEFAULT_SAVE_THE_DATE_HEADING
  const description = section.description?.trim()
  const steps = resolveRoadmapSteps(conference, lifecycle, formatDateSafe)
  const countdownTarget = resolveCountdownTarget(conference, {})

  return (
    <section className="py-16 sm:py-24" aria-labelledby="save-the-date-title">
      <Container>
        <div className="mx-auto max-w-3xl">
          <div className="overflow-hidden rounded-2xl bg-white/95 shadow-xl ring-1 ring-brand-cloud-blue/10 backdrop-blur-sm dark:bg-gray-800/95 dark:ring-gray-700">
            <div className="px-6 py-8 text-center sm:px-10 sm:py-12">
              <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand-sky-mist dark:bg-blue-900/50">
                <CalendarDaysIcon
                  className="h-7 w-7 text-brand-cloud-blue dark:text-blue-400"
                  aria-hidden="true"
                />
              </div>

              <p className="font-jetbrains text-sm tracking-wide text-brand-cloud-blue uppercase dark:text-blue-400">
                {heading}
              </p>

              {dates !== 'TBD' ? (
                <h2
                  id="save-the-date-title"
                  className="font-space-grotesk mt-2 text-3xl font-bold tracking-tighter text-brand-slate-gray sm:text-5xl dark:text-white"
                >
                  <time dateTime={conference.startDate}>{dates}</time>
                </h2>
              ) : (
                <h2
                  id="save-the-date-title"
                  className="font-space-grotesk mt-2 text-3xl font-bold tracking-tighter text-brand-slate-gray sm:text-5xl dark:text-white"
                >
                  {conference.title}
                </h2>
              )}

              {place ? (
                <p className="font-jetbrains mt-3 flex items-center justify-center gap-x-2 text-sm text-brand-cloud-blue dark:text-blue-400">
                  <MapPinIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{place}</span>
                </p>
              ) : null}

              {description ? (
                <p className="font-inter mx-auto mt-5 max-w-xl text-lg text-brand-slate-gray dark:text-gray-300">
                  {description}
                </p>
              ) : null}

              {countdownTarget !== null ? (
                <div className="mt-8">
                  <CountdownStrip targetMs={countdownTarget} />
                </div>
              ) : null}

              {steps.length > 0 ? (
                <div className="mt-10 rounded-xl bg-brand-sky-mist p-5 sm:p-6 dark:bg-blue-900/40">
                  <h3 className="font-space-grotesk text-base font-semibold text-brand-cloud-blue dark:text-blue-300">
                    What happens next
                  </h3>
                  <ol className="mt-4 space-y-3 text-left">
                    {steps.map((step) => (
                      <RoadmapRow key={step.key} step={step} />
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}

/**
 * One roadmap row: the milestone and where it stands on the left, and — only
 * when the step is actionable today — a button on the right. The status line is
 * never the button label, so the button says what a visitor gets to DO.
 */
function RoadmapRow({ step }: { step: RoadmapStep }) {
  const done = step.status === 'done'
  return (
    <li className="flex flex-col gap-y-2 sm:flex-row sm:items-center sm:justify-between sm:gap-x-4">
      <span className="flex items-start gap-x-2">
        {done ? (
          <CheckCircleIcon
            className="mt-0.5 h-4 w-4 shrink-0 text-brand-slate-gray/40 dark:text-gray-500"
            aria-hidden="true"
          />
        ) : (
          <span
            className={
              step.status === 'open'
                ? 'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-fresh-green'
                : 'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-cloud-blue/30 dark:bg-blue-400/40'
            }
            aria-hidden="true"
          />
        )}
        <span className="flex flex-col">
          <span
            className={
              done
                ? 'font-inter text-brand-slate-gray/60 dark:text-gray-400'
                : 'font-inter font-medium text-brand-slate-gray dark:text-gray-200'
            }
          >
            {step.label}
          </span>
          <span
            className={
              done
                ? 'font-jetbrains text-xs text-brand-slate-gray/50 dark:text-gray-500'
                : 'font-jetbrains text-xs text-brand-slate-gray/70 dark:text-gray-400'
            }
          >
            {step.detail}
          </span>
        </span>
      </span>
      {step.href && step.actionLabel ? (
        <span className="pl-6 sm:shrink-0 sm:pl-0">
          <Button
            href={step.href}
            variant="primary"
            className="px-4 py-1.5 text-sm font-semibold"
          >
            {step.actionLabel}
          </Button>
        </span>
      ) : null}
    </li>
  )
}
