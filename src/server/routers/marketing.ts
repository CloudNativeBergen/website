import { randomUUID } from 'node:crypto'
import { TRPCError } from '@trpc/server'
import { adminProcedure, router } from '@/server/trpc'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import type { Conference } from '@/lib/conference/types'
import { SeedPlanSchema } from '@/server/schemas/marketing'
import { BUILTIN_TEMPLATE } from '@/lib/marketing/template'
import { resolveAllMilestones } from '@/lib/marketing/milestones'
import { expandTemplate } from '@/lib/marketing/seed'
import { commitSeedPlan, getPlanView } from '@/lib/marketing/sanity'
import type { PlanView } from '@/lib/marketing/types'
import { getCurrentDateTime, osloTodayDateString } from '@/lib/time'

/**
 * The Marketing Plan's organizer surface (spec §8). `adminProcedure` is the
 * authz waist; the conference is ALWAYS the request domain's — a client can
 * name which optional Campaigns it wants, never which edition it seeds.
 */

/** The domain conference, or NOT_FOUND — the same rule as `resolveConferenceId`. */
async function requireConference(): Promise<Conference> {
  const { conference, error } = await getConferenceForCurrentDomain()
  if (error || !conference?._id) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Could not resolve conference from domain',
    })
  }
  return conference
}

/**
 * A conference that cannot anchor a plan (a required date missing or
 * malformed) is a settings problem the organizer can fix; say which field.
 */
function milestonesOrPrecondition(conference: Conference) {
  try {
    return resolveAllMilestones(conference)
  } catch (error) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message:
        error instanceof Error
          ? error.message
          : 'The conference dates cannot anchor a Marketing Plan',
    })
  }
}

export const marketingRouter = router({
  plan: router({
    /** The edition's plan on the Milestone timeline, or null before seeding. */
    get: adminProcedure.query(async (): Promise<PlanView | null> => {
      const conference = await requireConference()
      const stored = await getPlanView(conference._id)
      if (!stored) return null
      return {
        ...stored,
        milestones: milestonesOrPrecondition(conference),
        today: osloTodayDateString(),
      }
    }),

    /**
     * Seed the edition's plan from the built-in Template (spec §3.1). One
     * plan per edition: a second seed is refused, and a concurrent one loses
     * the transaction on the deterministic plan id.
     */
    seed: adminProcedure
      .input(SeedPlanSchema)
      .mutation(async ({ ctx, input }) => {
        const conference = await requireConference()
        if (await getPlanView(conference._id)) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'This edition already has a Marketing Plan',
          })
        }
        // Resolve first so a missing required date is reported as such
        // rather than as a generic expansion failure.
        milestonesOrPrecondition(conference)
        const seed = expandTemplate({
          template: BUILTIN_TEMPLATE,
          conference: {
            _id: conference._id,
            title: conference.title,
            city: conference.city,
            venueName: conference.venueName,
            ticketCapacity: conference.ticketCapacity,
            baseUrl: conferenceBaseUrl(conference),
            cfpStartDate: conference.cfpStartDate,
            cfpEndDate: conference.cfpEndDate,
            cfpNotifyDate: conference.cfpNotifyDate,
            programDate: conference.programDate,
            startDate: conference.startDate,
            endDate: conference.endDate,
            earlyBirdEndDate: conference.earlyBirdEndDate,
            registrationCloseDate: conference.registrationCloseDate,
            speakersAnnouncedDate: conference.speakersAnnouncedDate,
            sponsorDeadlineDate: conference.sponsorDeadlineDate,
            recordingsLiveDate: conference.recordingsLiveDate,
            ticketTargets: conference.ticketTargets,
          },
          includeOptional: input.includeOptional,
          ownerId: ctx.speaker._id,
          now: getCurrentDateTime(),
          newId: (type) => `${type}.${randomUUID()}`,
        })
        const result = await commitSeedPlan(seed)
        if (!result.committed) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'This edition already has a Marketing Plan',
          })
        }
        return {
          planId: seed.plan._id,
          campaigns: seed.campaigns.length,
          tasks: seed.tasks.length,
        }
      }),
  }),
})
