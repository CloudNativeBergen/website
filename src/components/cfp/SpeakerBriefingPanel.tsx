'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import type { TypedObject } from 'sanity'
import { PortableText } from '@portabletext/react'
import { portableTextComponents } from '@/lib/portabletext/components'
import type { SpeakerBriefing } from '@/lib/speaker/briefing'
import { formatConferenceDateLong, formatConferenceDayTime } from '@/lib/time'

interface SpeakerBriefingPanelProps {
  briefing: SpeakerBriefing
  /** The Oslo date (YYYY-MM-DD) when today is a conference day. */
  conferenceDay?: string
  /** Pin the dinner: from the start of its day until it begins. */
  pinDinner?: boolean
  /** Where a speaker writes when their dinner plans change. */
  changesEmail?: string
}

const isHttpUrl = (url?: string): url is string =>
  !!url && /^https?:\/\//i.test(url)

const linkClass =
  'text-brand-cloud-blue underline hover:no-underline dark:text-blue-400'

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

function Rich({ value }: { value: TypedObject[] }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <PortableText value={value} components={portableTextComponents} />
    </div>
  )
}

export function SpeakerBriefingPanel({
  briefing: b,
  conferenceDay,
  pinDinner,
  changesEmail,
}: SpeakerBriefingPanelProps) {
  const todayTalks = conferenceDay
    ? (b.talks ?? []).filter((t) => t.date === conferenceDay)
    : []

  const todos = b.todos && (
    <Section title="Still to do">
      <ul className="list-disc space-y-1 pl-5">
        {b.todos.map((t) => (
          <li key={`${t.kind}-${t.proposalId}`}>
            <Link href={`/cfp/proposal/${t.proposalId}`} className={linkClass}>
              {t.kind === 'confirm-talk'
                ? `Confirm your talk “${t.title}”`
                : `Upload slides for “${t.title}”`}
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  )

  const talkList = (title: string, talks: NonNullable<typeof b.talks>) => (
    <Section title={title}>
      <ul className="space-y-1">
        {talks.map((t) => (
          <li key={t.proposalId}>
            <span className="font-medium">{t.title}</span>
            {(t.date || t.startTime || t.trackTitle) && (
              <span className="text-gray-600 dark:text-gray-400">
                {' — '}
                {[
                  t.date && formatConferenceDateLong(t.date),
                  t.startTime &&
                    (t.endTime ? `${t.startTime}–${t.endTime}` : t.startTime),
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
      <p>
        {c.name}
        {c.phone && (
          <>
            {c.name && ' · '}
            <a
              href={`tel:${c.phone.replace(/\s+/g, '')}`}
              className={linkClass}
            >
              Call {c.phone}
            </a>
          </>
        )}
        {c.email && (
          <>
            {(c.name || c.phone) && ' · '}
            <a href={`mailto:${c.email}`} className={linkClass}>
              Email {c.email}
            </a>
          </>
        )}
      </p>
    </Section>
  )

  const checkIn = b.checkIn && (
    <Section title="Check-in">
      <Rich value={b.checkIn} />
    </Section>
  )

  const d = b.dinner
  const dinner = d && (
    <Section title="Speaker dinner">
      {d.rsvpNote && (
        <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
          {d.rsvpNote}
        </p>
      )}
      {d.text && <p className="whitespace-pre-line">{d.text}</p>}
      {d.startsAt && <p>{formatConferenceDayTime(d.startsAt)}</p>}
      {(d.venueName || d.address) && (
        <p>{[d.venueName, d.address].filter(Boolean).join(', ')}</p>
      )}
      {isHttpUrl(d.mapUrl) && (
        <p>
          <a
            href={d.mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            Map to the dinner venue
          </a>
        </p>
      )}
      {d.description && <Rich value={d.description} />}
      {d.routes && (
        <ul className="mt-2 space-y-2">
          {d.routes.map((r, i) => (
            <li key={r._key ?? i}>
              {r.label && <p className="font-medium">{r.label}</p>}
              {r.meetingPoint && (
                <p>
                  Meeting point:{' '}
                  {isHttpUrl(r.meetingPointMapUrl) ? (
                    <a
                      href={r.meetingPointMapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${linkClass} font-medium`}
                    >
                      {r.meetingPoint} (map)
                    </a>
                  ) : (
                    r.meetingPoint
                  )}
                </p>
              )}
              {(r.departsAt || r.departsNote) && (
                <p>
                  Departs{' '}
                  {[
                    r.departsAt && formatConferenceDayTime(r.departsAt),
                    r.departsNote,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              )}
              {r.details && <Rich value={r.details} />}
            </li>
          ))}
        </ul>
      )}
      {changesEmail && (
        <p className="mt-2">
          Changed your plans?{' '}
          <a href={`mailto:${changesEmail}`} className={linkClass}>
            Email {changesEmail}
          </a>
        </p>
      )}
    </Section>
  )

  const venue = (b.venueName || b.venueAddress || b.venueTravelInfo) && (
    <Section title="Venue and travel">
      {(b.venueName || b.venueAddress) && (
        <p>{[b.venueName, b.venueAddress].filter(Boolean).join(', ')}</p>
      )}
      {b.venueTravelInfo && (
        <p className="whitespace-pre-line">{b.venueTravelInfo}</p>
      )}
    </Section>
  )

  // TODO(#1592): switch to the shared section order constant in briefing.ts
  // once phase 3 merges. Order: to-dos, talks, dinner, check-in, equipment,
  // on-site contact, accommodation, extra, venue and travel.
  const pinned = !!conferenceDay || !!pinDinner
  const rest = (
    <>
      {b.talks && talkList('Your talks', b.talks)}
      {!pinDinner && dinner}
      {!conferenceDay && checkIn}
      {b.equipment && (
        <Section title="Equipment">
          <Rich value={b.equipment} />
        </Section>
      )}
      {!conferenceDay && contact}
      {b.accommodation && (
        <Section title="Accommodation">
          <Rich value={b.accommodation} />
        </Section>
      )}
      {b.extra && (
        <Section title="More information">
          <Rich value={b.extra} />
        </Section>
      )}
      {venue}
    </>
  )

  return (
    <section
      id="briefing"
      aria-labelledby="briefing-heading"
      className="scroll-mt-24 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40"
    >
      <h4
        id="briefing-heading"
        className="text-sm font-semibold text-gray-700 dark:text-gray-300"
      >
        Speaker briefing
      </h4>
      {pinned ? (
        <>
          {todayTalks.length > 0 && talkList('Your talks today', todayTalks)}
          {pinDinner && dinner}
          {conferenceDay && checkIn}
          {conferenceDay && contact}
          {todos}
          <details>
            <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
              Everything else
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
