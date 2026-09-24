/**
 * Who was INVITED to a speaker ticket, and at which addresses — the Sanity half
 * of the claim question.
 *
 * `@/lib/tickets/speakerStatus` holds the provider half (who redeemed) and the
 * join, but it cannot answer "was an invitation ever sent": that lives on
 * `talk.issuedSpeakerTickets[]`. This read builds the {@link SpeakerTicketInput}
 * list that `joinSpeakerTicketStatus` consumes.
 *
 * It was inlined in `tickets.admin.speakerTicketStatus`. `/admin/tickets` needs
 * the same three-way split (redeemed / invited / not-invited) for its free-ticket
 * table, and a second copy of this aggregation is exactly how two surfaces start
 * reporting different numbers for the same speaker.
 */
import { groq } from 'next-sanity'
import { clientReadUncached } from '@/lib/sanity/client'
import type { SpeakerTicketInput } from '@/lib/tickets/speakerStatus'
import { Status } from '@/lib/proposal/types'

/** The projection this reads — talks, not whole documents. */
interface SpeakerTicketTalk {
  issuedSpeakerTickets?: {
    speakerId?: string
    email?: string
    emailedAt?: string
  }[]
  speakers?:
    | {
        _id?: string
        email?: string
        knownEmails?: string[]
        ticketEmailGrants?: { email?: string }[]
      }[]
    | null
}

/**
 * One entry per speaker on a talk in `statuses`, unioning every address a
 * speaker is known by and keeping the EARLIEST invitation.
 *
 * Never throws: a failed read yields `null`, which callers must render as
 * unknown rather than as "nobody was invited".
 */
export async function fetchSpeakerTicketInputs(
  conferenceId: string,
  statuses: readonly Status[] = [Status.accepted, Status.confirmed],
): Promise<SpeakerTicketInput[] | null> {
  // Scoped by `conference._ref == $conferenceId` — the CONFERENCE_FILTER
  // predicate, written out literally because an interpolated root filter is
  // (rightly) unverifiable to the tenancy rule. The id is resolved server-side,
  // never client input. `speakers[]->` is a projection deref, not a second root
  // read.
  const query = groq`*[_type == "talk" && conference._ref == $conferenceId && status in $statuses]{
        issuedSpeakerTickets[]{ speakerId, email, emailedAt },
        speakers[]->{ _id, email, knownEmails, ticketEmailGrants }
      }`

  let talks: SpeakerTicketTalk[] | null
  try {
    talks = await clientReadUncached.fetch<SpeakerTicketTalk[]>(
      query,
      { conferenceId, statuses: [...statuses] },
      { cache: 'no-store' },
    )
  } catch (error) {
    console.error('[speakerTicketInputs] read failed', error)
    return null
  }

  const bySpeaker = new Map<string, SpeakerTicketInput>()
  for (const talk of talks ?? []) {
    const issued = talk.issuedSpeakerTickets ?? []
    for (const speaker of talk.speakers ?? []) {
      if (!speaker?._id) continue
      const entry = issued.find((i) => i?.speakerId === speaker._id)
      const existing = bySpeaker.get(speaker._id)
      const emails = [
        ...new Set([
          ...(existing?.emails ?? []),
          speaker.email,
          ...(speaker.knownEmails ?? []),
          ...(speaker.ticketEmailGrants?.map((g) => g.email) ?? []),
          entry?.email,
        ]),
      ]
      const invitedAt =
        existing?.invitedAt && entry?.emailedAt
          ? existing.invitedAt < entry.emailedAt
            ? existing.invitedAt
            : entry.emailedAt
          : (existing?.invitedAt ?? entry?.emailedAt ?? null)
      bySpeaker.set(speaker._id, { speakerId: speaker._id, emails, invitedAt })
    }
  }

  return [...bySpeaker.values()]
}
