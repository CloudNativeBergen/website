import { z } from 'zod'

/**
 * Schemas for the `topic` router (SE-2). Topics are standalone documents
 * referenced by `conference.topics[]` and `talk.topics[]`; the admin now creates
 * and edits them here instead of in Sanity Studio. Mirrors
 * `sanity/schemaTypes/topic.ts`: `title` + `color` are required (color is a hex
 * string), `description` is optional, and `slug` is derived from the title.
 */

/** Hex color, matching the Sanity topic schema (`#RGB` or `#RRGGBB`). */
export const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

const hexColor = z
  .string()
  .trim()
  .regex(HEX_COLOR_RE, 'Must be a valid hex color (e.g., #FF5733 or #F00)')

export const TopicCreateSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  // Optional on the wire so the inline "New topic" affordance can be
  // title-only; the router assigns a deterministic default when omitted (the
  // Sanity schema requires a color).
  color: hexColor.optional(),
  description: z.string().trim().nullable().optional(),
})

export const TopicUpdateSchema = z.object({
  id: z.string().trim().min(1, 'A topic id is required'),
  title: z.string().trim().min(1, 'Title is required').optional(),
  color: hexColor.optional(),
  description: z.string().trim().nullable().optional(),
})

export const TopicDeleteSchema = z.object({
  id: z.string().trim().min(1, 'A topic id is required'),
})
