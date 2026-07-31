import { TRPCError } from '@trpc/server'
import { router, adminProcedure } from '@/server/trpc'
import { SaveScheduleSchema } from '@/server/schemas/schedule'
import {
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
import { clientWrite } from '@/lib/sanity/client'
import { createReferenceWithKey } from '@/lib/sanity/helpers'

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

      // AUTO-FORK GUARD:
      // If we are saving a 'draft', but the existing document is 'official', we MUST fork it.
      if (payload._id && payload.status === ScheduleStatus.Draft) {
        const existingStatus = await getScheduleStatusById(payload._id)
        if (existingStatus === ScheduleStatus.Official) {
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
            const ref = talk.talk?._id || (talk.talk as any)?._ref
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

        let query = `*[_type == "schedule" && conference._ref == $conferenceId]`
        if (input.status) {
          query += ` && status == $status`
        }

        return await clientWrite.fetch(query, {
          conferenceId: conference._id,
          status: input.status,
        })
      }),

    getById: adminProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input, ctx }) => {
        const doc = await clientWrite.fetch(
          `*[_type == "schedule" && _id == $id && conference._ref == $conferenceId][0]`,
          { id: input.id, conferenceId: ctx.orgId },
        )
        if (!doc) throw new TRPCError({ code: 'NOT_FOUND' })
        return doc
      }),

    pollVersions: adminProcedure.query(async () => {
      const { conference, error } = await getConferenceForCurrentDomain()
      if (error || !conference) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch conference',
        })
      }
      return await clientWrite.fetch<{ _id: string; _rev: string; version: number }[]>(
        `*[_type == "schedule" && conference._ref == $conferenceId]{ _id, _rev, version }`,
        { conferenceId: conference._id }
      )
    }),

    delete: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const doc = await clientWrite.fetch(
          `*[_type == "schedule" && _id == $id && conference._ref == $conferenceId][0]`,
          { id: input.id, conferenceId: ctx.orgId },
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
    .mutation(async ({ input }) => {
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
            const ref = talk.talk?._id || (talk.talk as any)?._ref
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

        const existingOfficial = await clientWrite.fetch(
          `*[_type == "schedule" && conference._ref == $conferenceId && date == $date && status == 'official'][0]`,
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

        return { success: true, newStatus: ScheduleStatus.Official }
      }
    }),
})
