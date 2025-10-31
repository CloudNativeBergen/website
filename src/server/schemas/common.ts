import { z } from 'zod'

/**
 * Helper function to transform null values to undefined
 * Used in Zod schemas to handle nullable fields from Sanity
 */
export const nullToUndefined = <T>(val: T | null): T | undefined =>
  val === null ? undefined : val

/**
 * Common ID parameter schema
 * Used for routes that require an ID parameter
 */
export const IdParamSchema = z.object({
  id: z.string().min(1, 'ID is required'),
})

/**
 * Sanity reference schema
 * Represents a reference to another document in Sanity CMS
 */
export const ReferenceSchema = z.object({
  _type: z.literal('reference'),
  _ref: z.string(),
  _key: z.string().optional(),
})
