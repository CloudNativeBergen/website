'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import type { TypedObject } from 'sanity'
import { PortableText } from '@portabletext/react'
import { portableTextComponents } from '@/lib/portabletext/components'
import type {
  SpeakerBriefing,
  SpeakerBriefingTalk,
  SpeakerBriefingTodo,
} from '@/lib/speaker/briefing'
import {
  CalendarIcon,
  ChevronDownIcon,
  EnvelopeIcon,
  InformationCircleIcon,
  MapPinIcon,
  PhoneIcon,
} from '@heroicons/react/24/outline'
import {
  formatConferenceClock,
  formatConferenceDayDate,
  formatConferenceDayTime,
  osloTodayDateString,
} from '@/lib/time'
import { isSafeLinkHref } from '@/lib/portabletext/safeHref'
import { DinnerRouteChoice } from './DinnerRouteChoice'

interface SpeakerBriefingPanelProps {
  briefing: SpeakerBriefing
  /** The Oslo date (YYYY-MM-DD) when today is a conference day. */
  conferenceDay?: string
  /** Pin the dinner: from the start of its day until it begins. */
  pinDinner?: boolean
  /** Where a speaker writes when their dinner plans change. */
  changesEmail?: string
  /**
   * The speaker's dinner route, checked against the current routes; `null`
   * when unanswered. Leave it out to hide the route picker.
   */
  dinnerChoice?: string | null
  /** Shown to an organizer of the edition, who may have no talk. */
  asOrganizer?: boolean
  /**
   * The event hashtag (without `#`) and the conference's Bluesky handle.
   * Kept out of `briefing`, whose content versions the briefing email.
   */
  social?: { hashtag?: string; bluesky?: string }
}

// Map links open off-site, so http(s) only — no site paths.
const isHttpUrl = (url?: string): url is string =>
  !!url && /^https?:\/\//i.test(url) && isSafeLinkHref(url)

/** An instant in conference time, or nothing when it does not parse. */
const dayTime = (value?: string) =>
  value && !Number.isNaN(Date.parse(value))
    ? formatConferenceDayTime(value)
    : undefined

const validInstant = (value?: string): value is string =>
  !!value && !Number.isNaN(Date.parse(value))

const osloDay = (value: string) => osloTodayDateString(new Date(value))

const buttonClass =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700'

const linkClass =
  'text-brand-cloud-blue underline hover:no-underline dark:text-blue-400'

function todoLink(t: SpeakerBriefingTodo): { text: string; href?: string } {
  const text = t.title ? `${t.label} for “${t.title}”` : t.label
  if (t.kind === 'travel-support') return { text, href: '/cfp/expense' }
  if (t.kind === 'claim-ticket' || !t.proposalId) return { text }
  return { text, href: `/cfp/proposal/${t.proposalId}` }
}

// Same headings as the speaker info email (copy glossary, #1592).
function talksHeading(talks: SpeakerBriefingTalk[], today = false) {
  const workshops = talks.filter((t) => t.isWorkshop).length
  const heading =
    workshops === talks.length
      ? 'Your workshop'
      : workshops > 0
        ? 'Your talks and workshops'
        : talks.length === 1
          ? 'Your talk'
          : 'Your talks'
  return today ? `${heading} today` : heading
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h5 className="mb-1 text-sm font-semibold text-gray-900 dark:text-white">
        {title}
      </h5>
      <div className="text-sm text-gray-700 dark:text-gray-300">{children}</div>
    </section>
  )
}

/**
 * A long section folded behind its title: closed on phones, open from `sm`.
 * It renders closed on the server and opens after mount on a wide screen, so
 * hydration always matches.
 */
function Fold({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync with the viewport after hydration
    if (window.matchMedia('(min-width: 640px)').matches) setOpen(true)
  }, [])
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="group"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <h5 className="text-sm font-semibold text-gray-900 dark:text-white">
          {title}
        </h5>
        <ChevronDownIcon
          aria-hidden="true"
          className="h-5 w-5 shrink-0 text-gray-500 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="pb-1 text-sm text-gray-700 dark:text-gray-300">
        {children}
      </div>
    </details>
  )
}

function Rich({ value }: { value: TypedObject[] }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none [&>:first-child]:mt-0 [&>:last-child]:mb-0">
      <PortableText value={value} components={portableTextComponents} />
    </div>
  )
}

export function SpeakerBriefingPanel({
  briefing: b,
  conferenceDay,
  pinDinner,
  changesEmail,
  dinnerChoice,
  asOrganizer,
  social,
}: SpeakerBriefingPanelProps) {
  const todayTalks = conferenceDay
    ? (b.talks ?? []).filter((t) => t.date === conferenceDay)
    : []

  const todos = b.todos && (
    <Section title="Still to do">
      <ul className="list-disc space-y-1 pl-5">
        {b.todos.map((t) => {
          const { text, href } = todoLink(t)
          return (
            <li key={`${t.kind}-${t.proposalId ?? ''}`}>
              {href ? (
                <Link href={href} className={linkClass}>
                  {text}
                </Link>
              ) : (
                text
              )}
            </li>
          )
        })}
      </ul>
    </Section>
  )

  const talkList = (title: string, talks: NonNullable<typeof b.talks>) => (
    <Section title={title}>
      <ul className="space-y-1">
        {talks.map((t) => (
          <li key={t.proposalId}>
            {t.isWorkshop ? (
              <>
                Your workshop:{' '}
                <Link
                  href={`/cfp/workshop/${t.proposalId}`}
                  className={`${linkClass} font-medium`}
                >
                  {t.title}
                </Link>
              </>
            ) : (
              <span className="font-medium">{t.title}</span>
            )}
            {(t.date || t.startTime || t.trackTitle) && (
              <span className="text-gray-600 dark:text-gray-400">
                {' — '}
                {[
                  t.date && formatConferenceDayDate(t.date),
                  t.startTime &&
                    `${t.endTime ? `${t.startTime}–${t.endTime}` : t.startTime} (local time)`,
                  t.trackTitle,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Section>
  )

  const c = b.onsiteContact
  const contact = c && (
    <Section title="On-site contact">
      {c.name && <p className="mb-2">{c.name}</p>}
      {(c.phone || c.email) && (
        <div className="flex gap-2">
          {c.phone && (
            <a
              href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}
              className={`${buttonClass} flex-1 sm:flex-none`}
              aria-label={`Call ${c.phone}`}
            >
              <PhoneIcon aria-hidden="true" className="h-5 w-5" />
              Call
            </a>
          )}
          {c.email && (
            <a
              href={`mailto:${c.email}`}
              className={`${buttonClass} flex-1 sm:flex-none`}
              aria-label={`Email ${c.email}`}
            >
              <EnvelopeIcon aria-hidden="true" className="h-5 w-5" />
              Email
            </a>
          )}
        </div>
      )}
    </Section>
  )

  const checkIn = (folded: boolean) => {
    if (!b.checkIn) return undefined
    const Wrap = folded ? Fold : Section
    return (
      <Wrap title="Check-in">
        <Rich value={b.checkIn} />
      </Wrap>
    )
  }

  const d = b.dinner
  const showRoutePicker = !!d?.routes && dinnerChoice !== undefined
  const dinner = d && (
    <Section title="Speaker dinner">
      {d.rsvpNote && (
        <p className="mb-3 flex items-start gap-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-amber-900 dark:bg-amber-400/10 dark:text-amber-200">
          <InformationCircleIcon
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <span>{d.rsvpNote}</span>
        </p>
      )}
      {d.text && <p className="whitespace-pre-line">{d.text}</p>}
      {(dayTime(d.startsAt) || d.venueName || d.address) && (
        <ul className="space-y-1.5">
          {dayTime(d.startsAt) && (
            <li className="flex items-start gap-2">
              <CalendarIcon
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-gray-500"
              />
              <span>{dayTime(d.startsAt)} (local time)</span>
            </li>
          )}
          {(d.venueName || d.address) && (
            <li className="flex items-start gap-2">
              <MapPinIcon
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-gray-500"
              />
              <span>
                {[d.venueName, d.address].filter(Boolean).join(' · ')}
              </span>
            </li>
          )}
        </ul>
      )}
      {isHttpUrl(d.mapUrl) && (
        <a
          href={d.mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${buttonClass} mt-3 w-full sm:w-auto`}
        >
          <MapPinIcon aria-hidden="true" className="h-5 w-5" />
          Open map
        </a>
      )}
      {d.description && (
        <div className="mt-3 text-gray-600 dark:text-gray-400">
          <Rich value={d.description} />
        </div>
      )}
      {d.routes && (
        <ul className="mt-3 space-y-2">
          {d.routes.map((r, i) => {
            const at = validInstant(r.departsAt) ? r.departsAt : undefined
            const time =
              at &&
              (validInstant(d.startsAt) && osloDay(at) === osloDay(d.startsAt)
                ? formatConferenceClock(at)
                : formatConferenceDayTime(at))
            return (
              <li
                key={r._key ?? i}
                className="rounded-md border border-gray-200 p-3 dark:border-gray-700"
              >
                {(r.label || time || r.departsNote) && (
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    {r.label && <p className="font-semibold">{r.label}</p>}
                    {time ? (
                      <p className="text-gray-600 dark:text-gray-400">
                        Departs {time} (local time)
                      </p>
                    ) : (
                      r.departsNote && (
                        <p className="text-gray-600 dark:text-gray-400">
                          {r.departsNote}
                        </p>
                      )
                    )}
                  </div>
                )}
                {time && r.departsNote && (
                  <p className="text-gray-600 dark:text-gray-400">
                    {r.departsNote}
                  </p>
                )}
                {r.meetingPoint && (
                  <p className="mt-1 flex items-start gap-2">
                    <MapPinIcon
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0 text-gray-500"
                    />
                    {isHttpUrl(r.meetingPointMapUrl) ? (
                      <a
                        href={r.meetingPointMapUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${linkClass} rounded focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none`}
                      >
                        Meet at {r.meetingPoint}
                        <span className="sr-only"> (open map)</span>
                      </a>
                    ) : (
                      <span>Meet at {r.meetingPoint}</span>
                    )}
                  </p>
                )}
                {r.details && (
                  <div className="mt-1 text-gray-600 dark:text-gray-400">
                    <Rich value={r.details} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {showRoutePicker && (
        <DinnerRouteChoice routes={d.routes!} choice={dinnerChoice} />
      )}
      {changesEmail && (
        <p className="mt-2">
          {showRoutePicker
            ? 'Anything else about the dinner?'
            : 'Changed your plans?'}{' '}
          <a href={`mailto:${changesEmail}`} className={linkClass}>
            Email {changesEmail}
          </a>
        </p>
      )}
    </Section>
  )

  const socialMedia = (social?.hashtag || social?.bluesky) && (
    <Fold title="Social media">
      <p>
        {social.hashtag && (
          <>
            Post with <strong>#{social.hashtag}</strong>
            {social.bluesky ? ' and tag ' : '. '}
          </>
        )}
        {social.bluesky && (
          <>
            {social.hashtag ? '' : 'Tag '}
            <a
              href={`https://bsky.app/profile/${social.bluesky}`}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              @{social.bluesky}
            </a>
            .{' '}
          </>
        )}
        {social.hashtag
          ? 'Posts with the tag show on the screens in the rooms.'
          : 'Posts that tag the account show on the screens in the rooms.'}
      </p>
    </Fold>
  )

  const venue = (b.venueName || b.venueAddress || b.venueTravelInfo) && (
    <Fold title="Venue and travel">
      {(b.venueName || b.venueAddress) && (
        <p>{[b.venueName, b.venueAddress].filter(Boolean).join(' · ')}</p>
      )}
      {b.venueTravelInfo && (
        <p className="whitespace-pre-line">{b.venueTravelInfo}</p>
      )}
    </Fold>
  )

  // TODO(#1592): switch to the shared section order constant in briefing.ts
  // once phase 3 merges. Order: to-dos, talks, dinner, check-in, equipment,
  // on-site contact, accommodation, extra, venue and travel.
  // Pin only what exists; with nothing pinned, nothing is collapsed either.
  const pinTalks = todayTalks.length > 0
  const pinDin = !!pinDinner && !!dinner
  const pinCheckIn = !!conferenceDay && !!b.checkIn
  const pinContact = !!conferenceDay && !!contact
  const pinned = pinTalks || pinDin || pinCheckIn || pinContact
  const rest = (
    <>
      {b.talks && talkList(talksHeading(b.talks), b.talks)}
      {!pinDin && dinner}
      {!pinCheckIn && checkIn(true)}
      {b.equipment && (
        <Fold title="Equipment">
          <Rich value={b.equipment} />
        </Fold>
      )}
      {!pinContact && contact}
      {b.accommodation && (
        <Fold title="Accommodation">
          <Rich value={b.accommodation} />
        </Fold>
      )}
      {b.extra && (
        <Fold title="Good to know">
          <Rich value={b.extra} />
        </Fold>
      )}
      {socialMedia}
      {venue}
    </>
  )

  return (
    <section
      id="briefing"
      aria-labelledby="briefing-heading"
      className="scroll-mt-24 space-y-4 sm:rounded-lg sm:border sm:border-gray-200 sm:bg-gray-50 sm:p-4 dark:sm:border-gray-700 dark:sm:bg-gray-900/40"
    >
      <div>
        <div className="flex items-center justify-between gap-3">
          <h4
            id="briefing-heading"
            className="font-space-grotesk text-base font-bold text-gray-900 dark:text-white"
          >
            Speaker info
          </h4>
          {asOrganizer && (
            <Link
              href="/admin/speakers/info"
              className={`${buttonClass} shrink-0`}
            >
              Edit speaker info
            </Link>
          )}
        </div>
        {asOrganizer && (
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            You see this as an organizer. Speakers also see their own talks and
            to-dos.
          </p>
        )}
      </div>
      {pinned ? (
        <>
          {pinTalks && talkList(talksHeading(todayTalks, true), todayTalks)}
          {pinDin && dinner}
          {pinCheckIn && checkIn(false)}
          {pinContact && contact}
          {todos}
          <details>
            <summary className="flex min-h-11 cursor-pointer items-center rounded text-sm font-medium text-gray-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none dark:text-gray-300">
              More details
            </summary>
            <div className="mt-3 space-y-4">{rest}</div>
          </details>
        </>
      ) : (
        <>
          {todos}
          {rest}
        </>
      )}
    </section>
  )
}
