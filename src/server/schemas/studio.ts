import { z } from 'zod'
import { LiveDocumentIdSchema } from './social'

// These select cards from the server's org-scoped data; they do not scope queries.
const StudioDocumentIdSchema = LiveDocumentIdSchema.regex(/^[a-zA-Z0-9_.-]+$/)
  .optional()
  .catch(undefined)

export const StudioSearchParamsSchema = z.object({
  task: StudioDocumentIdSchema,
  speaker: StudioDocumentIdSchema,
  sponsor: StudioDocumentIdSchema,
  tab: z
    .enum([
      'meme-generator',
      'conference',
      'photo-gallery',
      'speakers',
      'sponsors',
    ])
    .optional()
    .catch(undefined),
})
