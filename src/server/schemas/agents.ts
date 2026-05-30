import { z } from 'zod'

export const AgentConfigSchema = z.object({
  conferenceContext: z.string().optional().nullable(),
  proposalReviewConfig: z.string().optional().nullable(),
  sponsorCrmConfig: z.string().optional().nullable(),
})
