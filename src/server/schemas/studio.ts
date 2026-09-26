import { z } from 'zod'
import { STUDIO_TABS } from '@/lib/marketing-asset/studio'
import { LiveDocumentIdSchema } from './social'

// These select cards from the server's org-scoped data; they do not scope queries.
const StudioDocumentIdSchema = LiveDocumentIdSchema.regex(/^[a-zA-Z0-9_.-]+$/)
  .optional()
  .catch(undefined)

export const StudioSearchParamsSchema = z.object({
  task: StudioDocumentIdSchema,
  speaker: StudioDocumentIdSchema,
  sponsor: StudioDocumentIdSchema,
  // A saved studio video (#1181); opened through `videoProject.open`, which
  // proves it this organization's.
  project: StudioDocumentIdSchema,
  tab: z.enum(STUDIO_TABS).optional().catch(undefined),
})
