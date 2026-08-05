import { formatDate } from '@/lib/time'
import { escapeHtml } from '@/lib/html/escape'
import type { Conference, ConferenceSchedule } from '@/lib/conference/types'

/**
 * Builder for the `/info` FAQ content.
 *
 * SECURITY — these answers are rendered as RAW HTML. `InfoContent` splits each
 * answer on newlines and hands every line to `dangerouslySetInnerHTML`, because
 * the hardcoded copy carries real markup (`<u>`, `<a href="/conduct">`, mailto
 * links). That makes every answer an HTML sink, so ANY value coming from the
 * conference document — all of which are editable by any organizer of the
 * tenant, and by anyone who compromises such an account — MUST be escaped
 * before it is interpolated. Tenants can share a parent domain for session
 * cookies, so script executing on one tenant's public `/info` page is a
 * plausible route to another tenant's session.
 *
 * Questions are NOT escaped: `InfoContent` renders them as JSX text, where
 * React escapes them already, and pre-escaping would double-encode.
 */

export interface InfoFaq {
  question: string
  answer: string
}

export interface InfoFaqSection {
  anchor: string
  heading: string
  description: string
  questions: InfoFaq[]
}

export interface ScheduleDayInfo {
  date: string
  registrationTime: string
  startTime: string
  endTime: string
  /**
   * Whether the three times above were READ OFF this day's talks, or invented.
   *
   * A schedule DOCUMENT is not a schedule: creating the day is an early setup
   * step, so "day exists, nothing in it" is a common — arguably the most
   * common — intermediate state, and for it the fields above are `08:00`,
   * `09:00` and `17:00`, which no organizer ever typed. Consumers that publish
   * these times to visitors must gate on this flag, not on the day's
   * existence.
   *
   * Deliberately ALL-OR-NOTHING and fail-closed: a half-filled first talk
   * (start but no end) leaves at least one published time invented, and no
   * caller wants to reason about which. A day with talks that carry real times
   * — every real conference schedule — is unaffected.
   */
  hasRealTimes: boolean
  isWorkshopDay: boolean
  schedule: ConferenceSchedule
}

export interface ScheduleInfo {
  hasMultipleDays: boolean
  workshopDay: ScheduleDayInfo | null
  conferenceDay: ScheduleDayInfo | null
  days: ScheduleDayInfo[]
}

export function getScheduleDayInfo(
  schedules: ConferenceSchedule[] | undefined,
): ScheduleInfo {
  if (!schedules || schedules.length === 0) {
    return {
      hasMultipleDays: false,
      workshopDay: null,
      conferenceDay: null,
      days: [],
    }
  }

  const sortedSchedules = [...schedules].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )

  const hasMultipleDays = sortedSchedules.length > 1

  const days = sortedSchedules.map((schedule) => {
    // `tracks` (and `talks`) are typed non-optional but a half-created schedule
    // document carries neither — and this runs on a public page with no error
    // boundary above it, so an absent array is an empty one, not a 500.
    const tracks = schedule.tracks ?? []
    const allTalks = tracks.flatMap((track) => track.talks ?? [])

    // First item is registration
    const registrationTalk = allTalks.length > 0 ? allTalks[0] : null
    const registrationTime = registrationTalk?.startTime || '08:00'

    // The first talk/workshop starts when registration ends (one hour after it starts)
    // This is the END time of the registration item
    const firstProgramTime = registrationTalk?.endTime || '09:00'

    const endTimes = allTalks.map((talk) => talk.endTime).filter(Boolean)
    const latestEnd =
      endTimes.length > 0 ? endTimes.sort().reverse()[0] : '17:00'

    const isWorkshopDay = tracks.some((track) =>
      track.trackTitle?.toLowerCase().includes('workshop'),
    )

    return {
      date: schedule.date,
      registrationTime,
      startTime: firstProgramTime,
      endTime: latestEnd,
      // Every `|| fallback` above fired off the SAME source, so one test covers
      // all three: a first talk carrying both of its own times, and at least
      // one end time anywhere on the day.
      hasRealTimes: Boolean(
        registrationTalk?.startTime &&
        registrationTalk?.endTime &&
        endTimes.length > 0,
      ),
      isWorkshopDay,
      schedule,
    }
  })

  return {
    hasMultipleDays,
    workshopDay: days[0] ?? null, // First day is always workshop day
    conferenceDay: days[1] ?? days[0] ?? null, // Second day is conference day, or first if only one day
    days,
  }
}

/**
 * Escapes a stored schedule time before interpolation. `startTime`/`endTime`
 * are free-text Sanity strings, not a validated time type, so they are as
 * attacker-controllable as any other field — the `|| fallback` shape below
 * only guards emptiness, never content.
 */
function time(value: string | undefined, fallback: string): string {
  return escapeHtml(value || fallback)
}

export function buildInfoFaqs(
  conference: Conference,
  scheduleInfo: ScheduleInfo,
): InfoFaqSection[] {
  // `formatDate` output is Intl-generated (or the literal "TBD"/"Invalid Date")
  // and cannot carry markup, but it is escaped anyway so that no reader has to
  // re-derive that argument to know the interpolation is safe.
  //
  // NOTE `formatDate('')` returns the literal "TBD". That is a fine placeholder
  // in an admin table but a falsehood in prose — "The conference will be held
  // on TBD" is what a brand-new tenant's `/info` page said, because
  // `@/lib/onboarding/create.ts` provisions no dates. Every `day(...)` call
  // below is therefore GATED on the value being present, rather than changing
  // the shared helper that ~30 other call sites depend on.
  const day = (value: string) => escapeHtml(formatDate(value))

  /**
   * The day whose times this page may publish, or `null`.
   *
   * Gating on the day's EXISTENCE is not enough: `getScheduleDayInfo` builds a
   * day for an empty schedule document too, filled with `08:00 / 09:00 / 17:00`
   * — so a tenant who created their schedule and has not filled it in (an early
   * setup step, and therefore a likelier state than having no schedule at all)
   * would publish invented times through this gate. `hasRealTimes` is the
   * question that actually matters.
   */
  const timedDay = (day: ScheduleDayInfo | null): ScheduleDayInfo | null =>
    day?.hasRealTimes ? day : null

  const conferenceDay = timedDay(scheduleInfo.conferenceDay)
  const workshopDay = timedDay(scheduleInfo.workshopDay)
  /** Both days real: the only state in which the two-day answers are true. */
  const bothDays =
    scheduleInfo.hasMultipleDays && workshopDay && conferenceDay
      ? { workshopDay, conferenceDay }
      : null

  const dateAnswer = (() => {
    if (bothDays) {
      // The span sentence is dropped when the conference itself carries no
      // dates: the per-day breakdown below comes from the schedule and is true
      // regardless.
      const span =
        conference.startDate && conference.endDate
          ? `This is a multi-day event running from ${day(conference.startDate)} to ${day(conference.endDate)}.

`
          : ''

      return `${span}Day 1 (${day(bothDays.workshopDay.date)}) - Workshop Day: Registration opens at ${escapeHtml(bothDays.workshopDay.registrationTime)}. Workshops run from ${escapeHtml(bothDays.workshopDay.startTime)} to ${escapeHtml(bothDays.workshopDay.endTime)}.

Day 2 (${day(bothDays.conferenceDay.date)}) - Main Conference: Registration opens at ${escapeHtml(bothDays.conferenceDay.registrationTime)}. Talks are scheduled from ${escapeHtml(bothDays.conferenceDay.startTime)} to ${escapeHtml(bothDays.conferenceDay.endTime)}.

Important: Please check your ticket type. Workshop tickets (&quot;Workshop + Conference&quot;) grant access to both days, while conference-only tickets grant access to the main conference day only.`
    }

    // Two independent facts, each kept only if it is one: the dates, and the
    // running times. A tenant with dates but no usable schedule gets the dates
    // alone; a tenant with neither gets no question at all (see below), because
    // an answer that says nothing is worse than a question that is not asked
    // yet.
    const dates =
      conference.startDate &&
      conference.endDate &&
      conference.endDate !== conference.startDate
        ? // Reached by a multi-day conference whose schedule is not filled in:
          // the span is known even when the running order is not.
          `This is a multi-day event running from ${day(conference.startDate)} to ${day(conference.endDate)}.`
        : conference.startDate
          ? `The conference will be held on ${day(conference.startDate)}.`
          : null

    const sentences = [
      dates,
      conferenceDay
        ? `Registration opens at ${time(conferenceDay.registrationTime, '08:00')}. The talks are scheduled to start at ${time(conferenceDay.startTime, '09:00')} and to end at ${time(conferenceDay.endTime, '17:00')}.`
        : null,
    ].filter(Boolean)

    return sentences.length > 0 ? sentences.join(' ') : null
  })()

  const venueLocation = [conference.city, conference.country]
    .filter(Boolean)
    .map(escapeHtml)
    .join(', ')

  // Provisioning writes city/country but no venue, so the old copy read "will
  // take place at the venue in Bergen, Norway" — a definite article standing in
  // for a booking that does not exist. Name the venue when there is one, give
  // the address alone when that is all there is, say only where the event is
  // when even that is missing, and ask nothing when none of it is known.
  const venueAnswer = (() => {
    const address = conference.venueAddress
      ? ` The address is ${escapeHtml(conference.venueAddress)}.`
      : ''
    const inLocation = venueLocation ? ` in ${venueLocation}` : ''
    if (conference.venueName) {
      return `The conference will take place at ${escapeHtml(conference.venueName)}${inLocation}.${address}`
    }
    if (conference.venueAddress) {
      return `The conference will take place${inLocation}.${address}`
    }
    if (venueLocation) {
      return `The conference will take place in ${venueLocation}. The venue has not been announced yet.`
    }
    return null
  })()

  const contactEmail = escapeHtml(conference.contactEmail || '')

  // The sponsor ticket-redemption answer describes ONE vendor's flow (the
  // sender address is literally Checkin's). Absent means Checkin — that is what
  // `resolveTicketProvider` treats it as — so this keeps rendering for every
  // Checkin tenant and degrades to a vendor-neutral answer for anyone else.
  const usesCheckin =
    !conference.ticketingProvider || conference.ticketingProvider === 'checkin'

  return [
    {
      anchor: 'general',
      heading: 'For Attendees',
      description: 'Practical information for attending the conference.',
      questions: [
        // No dates and no schedule means the organizers have not decided yet —
        // and a FAQ that answers "we don't know" is noise. The page's own
        // intro already invites the reader to ask.
        ...(dateAnswer
          ? [
              {
                question: 'What is the date of the conference?',
                answer: dateAnswer,
              },
            ]
          : []),
        // `city, country` joined defensively — an unset country used to render
        // the literal string "undefined" on the public page.
        ...(venueAnswer
          ? [
              {
                question: 'Where is the conference located?',
                answer: venueAnswer,
              },
            ]
          : []),
        // Travel directions are PLACE-SPECIFIC, so they come from the tenant's
        // own `venueTravelInfo`. This used to be hardcoded Bergen transit prose
        // (Byparken, Bybanen, "airport Flesland") rendered with whatever city a
        // tenant had configured — false for everyone but Bergen. No stored
        // answer now means no question, not a wrong one.
        //
        // The whole answer is tenant prose, so the whole answer is escaped:
        // organizers cannot embed markup or links here. That is the correct
        // default for a raw-HTML sink — the alternative is an allowlist
        // sanitiser, which is not worth carrying for three plain-prose fields.
        ...(conference.venueTravelInfo
          ? [
              {
                question: 'How do I get to the venue?',
                answer: escapeHtml(conference.venueTravelInfo),
              },
            ]
          : []),
        // A claim about A venue needs a venue. With none booked this said "Yes,
        // the venue is accessible" about a room nobody has chosen.
        ...(conference.venueName
          ? [
              {
                question: 'Is this venue accessible?',
                answer:
                  'Yes, the venue is accessible. If you have any special needs, please let us know in advance as a part of the ticket registration, and we will do our best to accommodate you.',
              },
            ]
          : []),
        {
          question: 'What about allergies and dietary restrictions?',
          // No longer opens with "We will serve food and drinks during the
          // conference": nothing in the conference document says a tenant
          // caters, and this page has no business promising lunch on their
          // behalf. Asking about restrictions costs nothing and stays useful
          // either way. A `cateringInfo` field would let organizers say it
          // themselves — filed, not built here.
          answer:
            'If you have any allergies or dietary restrictions, please let us know in advance as a part of the ticket registration, and we will do our best to accommodate you.',
        },
        {
          question: 'What ticket types are available?',
          answer: scheduleInfo.hasMultipleDays
            ? 'There are two main ticket types: Workshop + Conference (2 days) tickets provide access to both the workshop day and the main conference day, while Conference Only tickets grant access to the main conference day only. Please verify your ticket type before attending to ensure you have access to the correct days.'
            : // The old list of inclusions ("talks, workshops, food, and the
              // afterparty") named three things this site cannot know about.
              'Please check your ticket confirmation for details about what your ticket includes.',
        },
        // "When" is the question, and the answer is a registration time read
        // off the schedule. Without one this said "Registration opens at 08:00"
        // — and describing a desk "at the venue" two answers below "The venue
        // has not been announced yet" is its own small absurdity.
        ...(conferenceDay
          ? [
              {
                question: 'When and where can I pick up my badge?',
                answer: bothDays
                  ? `You can pick up your badge at the registration desk at the venue. Registration opens at ${escapeHtml(bothDays.workshopDay.registrationTime)} on ${day(bothDays.workshopDay.date)} (workshop day) and at ${escapeHtml(bothDays.conferenceDay.registrationTime)} on ${day(bothDays.conferenceDay.date)} (conference day). If you&apos;re attending both days, we recommend picking up your badge on the first day.`
                  : `You can pick up your badge at the registration desk at the venue. Registration opens at ${time(conferenceDay.registrationTime, '08:00')}. We recommend arriving early to get your badge and find a good seat.`,
              },
            ]
          : []),
        // Every word of this answer is a clock time read off the schedule, so
        // without one there is nothing left to say — and "Doors open at 08:00"
        // was the invention a reader was most likely to plan a train around.
        ...(conferenceDay
          ? [
              {
                question: 'When will the doors open?',
                answer: bothDays
                  ? `Doors open for registration at ${time(bothDays.workshopDay.registrationTime, '08:00')} on the workshop day and at ${time(bothDays.conferenceDay.registrationTime, '08:00')} on the conference day. The first workshop starts at ${time(bothDays.workshopDay.startTime, '09:00')} and the first talk starts at ${time(bothDays.conferenceDay.startTime, '09:00')}. We suggest arriving at registration time to pick up your badge, enjoy coffee, and find a good seat.`
                  : `Doors open for registration at ${time(conferenceDay.registrationTime, '08:00')}. The first talk starts at ${time(conferenceDay.startTime, '09:00')}. We suggest arriving early to pick up your badge and find a good seat.`,
              },
            ]
          : []),
        {
          question: 'What is the code of conduct?',
          answer: `We have a code of conduct that all attendees, speakers, and sponsors must follow. You can read the code of conduct on our website at <u><a href="/conduct">Code of Conduct</a></u>. If you have any questions or concerns, please contact us.`,
        },
        // REMOVED: "What happens after the conference?" — an afterparty at the
        // same venue, starting at 6 PM, food and drinks included in the ticket.
        // Four separate commitments made on behalf of a tenant that never
        // configured any of them, on the page a prospect reads first. There is
        // no field to key it on, so it is omitted for everyone until one exists
        // (an `afterpartyInfo` prose field, filed alongside `cateringInfo`),
        // exactly as the travel and speaker-dinner answers already work.
      ],
    },
    {
      anchor: 'speakers',
      heading: 'For Speakers',
      description:
        'Information for our awesome speakers to make their experience as smooth as possible. If you have any other questions do not hesitate to contact us.',
      questions: [
        {
          question: 'What do I need to do before the conference?',
          answer:
            'You need to confirm your talk and register your ticket before the conference. You can do this by going to the <u><a href="/cfp/list">speaker dashboard</a></u> to confirm your talk, and clicking the link in the email you received to register your complimentary speaker ticket.',
        },
        // Also place-specific (the old copy named a Bergen mountain and linked a
        // Bergen cable car), and not every conference holds one at all — so the
        // question exists only when the tenant has written the answer.
        ...(conference.speakerDinnerInfo
          ? [
              {
                question: 'Will there be a speaker dinner?',
                answer: escapeHtml(conference.speakerDinnerInfo),
              },
            ]
          : []),
        {
          question: 'Can I make changes to my talk?',
          answer:
            'Yes, you can make changes to your talk up until the day before the conference. You can edit your talk directly from our website by going to the <u><a href="/cfp/list">speaker dashboard</a></u>.',
        },
        {
          question: 'Do I need to bring my own laptop?',
          answer:
            'Yes, we recommend you to bring your own laptop. We will provide a projector and a screen for your presentation. If you have any special needs, please let us know in advance.',
        },
        // Local sightseeing advice cannot be generated — the old copy asserted
        // fjords, mountains and Bryggen for whatever city was configured, and
        // linked Bergen's tourist board. Tenant-authored or absent.
        ...(conference.localRecommendations
          ? [
              {
                // Deliberately NOT escaped: this is the only tenant value that
                // lands in a QUESTION, and questions are rendered as JSX text.
                // React escapes it there; escaping here too would surface
                // literal entities like `&amp;` to readers.
                question: conference.city
                  ? `What do you recommend me to do during my stay in ${conference.city}?`
                  : 'What do you recommend me to do during my stay?',
                answer: escapeHtml(conference.localRecommendations),
              },
            ]
          : []),
      ],
    },
    {
      anchor: 'sponsors',
      heading: 'For Sponsors',
      description:
        'Information for our amazing sponsors that makes this event happening. If you have any questions, please contact us.',
      questions: [
        {
          question: 'How do I obtain the sponsor tickets?',
          answer: usesCheckin
            ? `Sponsors will receive a unique link to <u>checkin.no</u> to redeem their complimentary tickets prior to the conference. The email will be sent to the contact person listed in the sponsor agreement and can register all the tickets at once.\nThe email will be sent from <u>no-reply@messenger.checkin.no</u>. If you have not received your link, please check your spam folder or <u><a href="mailto:${contactEmail}">contact us</a></u>.`
            : `Sponsors will receive a unique link to redeem their complimentary tickets prior to the conference. The email will be sent to the contact person listed in the sponsor agreement and can register all the tickets at once.\nIf you have not received your link, please check your spam folder or <u><a href="mailto:${contactEmail}">contact us</a></u>.`,
        },
        {
          question: 'What should I do with the sponsor rollups?',
          answer: `You can bring your rollups to the venue on the day of the conference, or the day before. We will have a designated area for sponsor rollups. If you have any questions, please <u><a href="mailto:${contactEmail}">contact us</a></u>.`,
        },
        {
          question: 'Where can I place my sponsor materials?',
          answer: `We will have a designated area for sponsor rollups and a table for sponsor materials. We do not have space for sponsor booths. If you have any questions, please <u><a href="mailto:${contactEmail}">contact us</a></u>.`,
        },
        {
          question: 'Do you provide a list of attendees?',
          // No trailing "and afterparty": that event is no longer described
          // anywhere on this page, because nothing in the document says it
          // happens.
          answer: `No, we do not provide a list of attendees. However, we encourage you to network with the attendees during the conference.`,
        },
      ],
    },
  ]
}
