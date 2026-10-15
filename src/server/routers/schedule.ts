import { TRPCError } from '@trpc/server'
import { router, adminProcedure } from '@/server/trpc'
import { SaveScheduleSchema } from '@/server/schemas/schedule'
import { notifyScheduleChanges } from '@/lib/reminders'
import {
  collectPlacements,
  saveScheduleToSanity,
  getValidTalkIds,
  getTalkStatuses,
  getScheduleStatusById,
} from '@/lib/schedule/sanity'
import { validateSchedulePayload } from '@/lib/schedule/validation'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { revalidateTag } from 'next/cache'
import { conferenceTag } from '@/lib/cache/tags'
import type { ConferenceSchedule } from '@/lib/conference/types'
import { ScheduleStatus } from '@/lib/schedule/types'
import { Status as ProposalStatus } from '@/lib/proposal/types'
import { z } from 'zod'
import { clientReadCached, clientWrite } from '@/lib/sanity/client'
import { createReferenceWithKey } from '@/lib/sanity/helpers'

/**
 * A talk reference arrives either expanded (`_id`, from a dereferencing read)
 * or raw (`_ref`, straight off the stored document). Read whichever is present
 * through a precise shape rather than casting the payload to `any`.
 */
function talkReferenceId(talk: {
  talk?: { _id?: string; _ref?: string } | null
}): string | undefined {
  return talk.talk?._id ?? talk.talk?._ref
}

export const scheduleRouter = router({
  save: adminProcedure
    .input(SaveScheduleSchema)
    .mutation(async ({ input, ctx }) => {
      const { conference, error: conferenceError } =
        await getConferenceForCurrentDomain()

      if (conferenceError || !conference) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch conference',
        })
      }

      const payload = input as ConferenceSchedule

      // DATE GUARD: reject any schedule whose date falls outside the conference
      // window. Prevents accidental creation of rogue days (e.g. wrong date in a
      // CLI script or a stale client payload with a garbage date).
      if (conference.startDate && conference.endDate && payload.date) {
        if (
          payload.date < conference.startDate ||
          payload.date > conference.endDate
        ) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Schedule date ${payload.date} is outside the conference dates (${conference.startDate} – ${conference.endDate}).`,
          })
        }
      }

      // AUTO-FORK GUARD:
      // Saving a 'draft' onto a published day must fork rather than demote it.
      // A legacy day has NO status field, and every read path treats that as
      // official — so `null` has to fork too, otherwise the one save path that
      // can reach a legacy day would patch the live program to `draft` in place
      // and blank it from the public site.
      if (payload._id && payload.status === ScheduleStatus.Draft) {
        const existingStatus = await getScheduleStatusById(
          payload._id,
          conference._id,
        )
        if (
          existingStatus === ScheduleStatus.Official ||
          existingStatus === null
        ) {
          console.log(
            `Auto-forking official schedule ${payload._id} into a new draft.`,
          )
          payload._id = ''
          payload._rev = undefined
        }
      }

      // STRICT BLOCK:
      // If publishing an official schedule, every scheduled talk must be approved.
      if (payload.status === ScheduleStatus.Official) {
        const statuses = await getTalkStatuses(conference._id)
        for (const track of payload.tracks || []) {
          for (const talk of track.talks || []) {
            if (talk.placeholder) continue
            const ref = talkReferenceId(talk)
            if (ref) {
              const status = statuses[ref]
              if (
                status !== ProposalStatus.accepted &&
                status !== ProposalStatus.confirmed
              ) {
                throw new TRPCError({
                  code: 'BAD_REQUEST',
                  message: `Strict Block: Cannot publish schedule. Talk ${ref} is not accepted/confirmed (status: ${status}).`,
                })
              }
            }
          }
        }
      }

      const validTalkIds = await getValidTalkIds(conference._id)
      const validationError = validateSchedulePayload(payload, validTalkIds)
      if (validationError) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: validationError })
      }

      const {
        schedule,
        error: saveError,
        conflict,
      } = await saveScheduleToSanity(payload, conference, {
        actorId: ctx.speaker?._id,
      })

      if (conflict) {
        throw new TRPCError({
          code: 'CONFLICT',
          message:
            saveError || 'This day was changed elsewhere since you loaded it.',
        })
      }

      if (saveError || !schedule) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: saveError || 'Failed to save schedule',
        })
      }

      // A schedule save changes exactly ONE conference's program. Revalidate the
      // tenant-scoped tag ONLY — the generic `content:program`/`content:conferences`
      // tags would bust every other conference's cached pages. Every page that
      // renders this conference's content (and the shared conference read in
      // `fetchConferenceData`) now carries `sanity:conference-<id>`, so the
      // scoped tag alone fully invalidates this tenant.
      revalidateTag(conferenceTag(conference._id), 'default')

      return { schedule }
    }),

  admin: router({
    list: adminProcedure
      .input(
        z.object({
          status: z.nativeEnum(ScheduleStatus).optional(),
        }),
      )
      .query(async ({ input }) => {
        const { conference, error } = await getConferenceForCurrentDomain()
        if (error || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch conference',
          })
        }

        // Build the predicate INSIDE the brackets. Appending to the finished
        // `*[...]` put the status test outside them, which GROQ reads as an
        // array ANDed with a comparison rather than a filter — so every
        // `list({ status })` call returned garbage instead of a filtered set.
        const predicates = [
          '_type == "schedule"',
          'conference._ref == $conferenceId',
        ]
        if (input.status) {
          predicates.push('status == $status')
        }
        const query = `*[${predicates.join(' && ')}]`

        return await clientWrite.fetch(query, {
          conferenceId: conference._id,
          status: input.status,
        })
      }),

    getById: adminProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        const { conference, error } = await getConferenceForCurrentDomain()
        if (error || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch conference',
          })
        }
        const doc = await clientWrite.fetch(
          `*[_type == "schedule" && _id == $id && conference._ref == $conferenceId][0]`,
          { id: input.id, conferenceId: conference._id },
        )
        if (!doc) throw new TRPCError({ code: 'NOT_FOUND' })
        return doc
      }),

    /**
     * THE SCHEDULE EDITOR'S ONE POLL.
     *
     * It exists to notice what OTHER organizers changed while this editor is
     * open — never to reflect the current user's own actions, which are applied
     * optimistically and confirmed by their own mutation. That is why one
     * request a minute is enough, and why it may be served from Sanity's CDN.
     *
     * It replaces two procedures (`pollVersions` + `pollProposalsStatus`) that
     * the client batched into one HTTP call but that Sanity billed as TWO
     * reads, every ten seconds, per open editor. Composition happens HERE so
     * the client keeps consuming one object.
     *
     * WHAT IT RETURNS, and why it is not the talk set:
     *  - `schedules` — the `_rev` of every schedule day, which is what the
     *    conflict banner compares against the revisions this client has held.
     *  - `proposalsFingerprint` — a SCALAR that changes whenever any talk in
     *    this conference is created, deleted or edited. The old poll shipped
     *    `{_id, status}` for EVERY talk on every tick to detect a change that
     *    happens a handful of times a day; the fingerprint detects the same
     *    change in a constant number of bytes, and the editor fetches the
     *    statuses themselves (`proposalsStatus`) only when it moves.
     *
     * READ CLIENT: `clientReadCached` — the CDN host. Same token and same
     * access rights as `clientReadUncached` (see `lib/sanity/client.ts`); the
     * only differences are which quota it bills and how stale it may be.
     * `cacheMode: 'noStale'` asks APICDN not to answer from a stale entry, so
     * this stays a change DETECTOR. Staleness could in any case only DELAY a
     * banner, never invent one: a stale response carries an OLDER revision, and
     * an older revision is either one this client held (known, not foreign) or
     * one it never held (a real external change, reported a tick later).
     * `cache: 'no-store'` keeps Next's data cache out of it — the single
     * property the write client was being used for.
     */
    pollExternalChanges: adminProcedure.query(async () => {
      const { conference, error } = await getConferenceForCurrentDomain()
      if (error || !conference) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch conference',
        })
      }
      const probe = await clientReadCached.fetch<{
        schedules: { _id: string; _rev: string; version: number }[] | null
        proposalCount: number | null
        proposalsLastUpdatedAt: string | null
      }>(
        `{
          "schedules": *[_type == "schedule" && conference._ref == $conferenceId]{ _id, _rev, version },
          "proposalCount": count(*[_type == "talk" && conference._ref == $conferenceId]),
          "proposalsLastUpdatedAt": *[_type == "talk" && conference._ref == $conferenceId] | order(_updatedAt desc)[0]._updatedAt
        }`,
        { conferenceId: conference._id },
        { cacheMode: 'noStale', cache: 'no-store' },
      )
      return {
        schedules: probe?.schedules ?? [],
        // Count AND newest write: an edit moves `_updatedAt`, a create or
        // delete moves the count (a delete of the newest-written talk moves
        // both). Only a mutation can move either, so an unchanged fingerprint
        // means an unchanged talk set.
        proposalsFingerprint: `${probe?.proposalCount ?? 0}:${
          probe?.proposalsLastUpdatedAt ?? 'none'
        }`,
      }
    }),

    /**
     * The talk statuses themselves — fetched ON CHANGE, not on a timer.
     *
     * `fingerprint` is the `proposalsFingerprint` the editor last saw from
     * {@link pollExternalChanges}. The server does not filter on it: it is a
     * CACHE KEY, and that is the whole point. React Query keys this query by
     * its input, so while the fingerprint is unchanged the editor reads its own
     * cache and issues NO request, and a changed fingerprint is a new key and
     * therefore exactly one fetch. Keeping it in the input rather than in
     * component state means the caching is react-query's, not ours.
     *
     * Same CDN client as the poll, for the same reasons.
     */
    proposalsStatus: adminProcedure
      .input(z.object({ fingerprint: z.string() }))
      .query(async () => {
        const { conference, error } = await getConferenceForCurrentDomain()
        if (error || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch conference',
          })
        }
        return await clientReadCached.fetch<{ _id: string; status: string }[]>(
          `*[_type == "talk" && conference._ref == $conferenceId]{ _id, status }`,
          { conferenceId: conference._id },
          { cacheMode: 'noStale', cache: 'no-store' },
        )
      }),

    delete: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input }) => {
        const { conference, error } = await getConferenceForCurrentDomain()
        if (error || !conference) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch conference',
          })
        }
        const doc = await clientWrite.fetch(
          `*[_type == "schedule" && _id == $id && conference._ref == $conferenceId][0]`,
          { id: input.id, conferenceId: conference._id },
        )
        if (!doc) throw new TRPCError({ code: 'NOT_FOUND' })
        if (doc.status === ScheduleStatus.Official) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot delete an official schedule.',
          })
        }
        await clientWrite.delete(input.id)
        return { success: true }
      }),
  }),

  action: adminProcedure
    .input(
      z.object({
        id: z.string(),
        action: z.enum(['promote']),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { conference, error } = await getConferenceForCurrentDomain()
      if (error || !conference) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch conference',
        })
      }

      const targetSchedule = await clientWrite.fetch(
        `*[_type == "schedule" && _id == $id && conference._ref == $conferenceId][0]`,
        { id: input.id, conferenceId: conference._id },
      )
      if (!targetSchedule) throw new TRPCError({ code: 'NOT_FOUND' })

      if (input.action === 'promote') {
        if (targetSchedule.status === ScheduleStatus.Official) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Already official',
          })
        }

        // Strict Block for promote!
        const statuses = await getTalkStatuses(conference._id)
        for (const track of targetSchedule.tracks || []) {
          for (const talk of track.talks || []) {
            if (talk.placeholder) continue
            const ref = talkReferenceId(talk)
            if (ref) {
              const status = statuses[ref]
              if (
                status !== ProposalStatus.accepted &&
                status !== ProposalStatus.confirmed
              ) {
                throw new TRPCError({
                  code: 'BAD_REQUEST',
                  message: `Strict Block: Cannot publish schedule. Talk ${ref} is not accepted/confirmed (status: ${status}).`,
                })
              }
            }
          }
        }

        const date = targetSchedule.date

        // A legacy day written before this feature has NO `status` field, and
        // every read path treats that as official. Matching only
        // `status == 'official'` here left the legacy day in
        // `conference.schedules` and appended a second official doc for the
        // same date — two "official" days, which makes the speaker-facing
        // lookups tie on `order(date asc)[0]` and go nondeterministic again.
        const existingOfficial = await clientWrite.fetch<{
          _id: string
          tracks?: ConferenceSchedule['tracks']
        } | null>(
          `*[_type == "schedule" && conference._ref == $conferenceId && date == $date && (status == 'official' || !defined(status))][0]`,
          { conferenceId: conference._id, date },
        )

        const tx = clientWrite.transaction()

        if (existingOfficial) {
          tx.patch(existingOfficial._id, (p) =>
            p.set({ status: ScheduleStatus.Archived }),
          )
          tx.patch(conference._id, (p) =>
            p.unset([`schedules[_ref == "${existingOfficial._id}"]`]),
          )
        }

        tx.patch(targetSchedule._id, (p) =>
          p.set({ status: ScheduleStatus.Official }),
        )
        tx.patch(conference._id, (p) =>
          p
            .setIfMissing({ schedules: [] })
            .append('schedules', [
              createReferenceWithKey(targetSchedule._id, 'schedule'),
            ]),
        )

        await tx.commit()
        revalidateTag(conferenceTag(conference._id), 'default')

        // SCHEDULE-CHANGE ALERTS. Publishing is now the ONLY write that changes
        // the public program — draft saves auto-fork and Live mode is read-only
        // — so this is where speakers must be told their talk moved. Diffing the
        // day we just archived against the one we just published gives exactly
        // the moves that became public.
        //
        // Never-fail, like the save path: the program IS published at this
        // point, and an alert failure must not report that as an error.
        try {
          await notifyScheduleChanges({
            prior: collectPlacements(date, existingOfficial?.tracks),
            next: collectPlacements(date, targetSchedule.tracks),
            conferenceId: conference._id,
            actorId: ctx.speaker?._id,
          })
        } catch (alertError) {
          console.error(
            `Schedule promoted (${targetSchedule._id}) but speaker alerts failed:`,
            alertError,
          )
        }

        return { success: true, newStatus: ScheduleStatus.Official }
      }
    }),
})
