import { z } from 'zod'

/**
 * Schemas for the `staff` router (SE-4). Staff are flat, standalone documents
 * surfaced publicly at `/staff/[role]`; the admin now creates and edits them
 * here instead of in Sanity Studio. Mirrors `sanity/schemaTypes/staff.ts`:
 * `name`, `role` and `link` are required; `email`, `company` and `image` are
 * optional. `image` is a Sanity image ASSET id (e.g. `image-abc-200x200-png`),
 * uploaded via `/api/admin/speaker-image` (a generic organizer-only image
 * uploader) and stored as an `image` object referencing that asset.
 */

/** A Sanity image asset id, as returned by the upload route (`image-…`). */
const imageAssetId = z
  .string()
  .trim()
  .regex(/^image-/, 'Must be a Sanity image asset id')

export const StaffCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  role: z.string().trim().min(1, 'Role is required'),
  link: z.string().trim().url('Must be a valid URL'),
  email: z.string().trim().email('Must be a valid email').optional(),
  company: z.string().trim().min(1).optional(),
  image: imageAssetId.optional(),
})

export const StaffUpdateSchema = z.object({
  id: z.string().trim().min(1, 'A staff id is required'),
  name: z.string().trim().min(1, 'Name is required').optional(),
  role: z.string().trim().min(1, 'Role is required').optional(),
  link: z.string().trim().url('Must be a valid URL').optional(),
  // Optional detail fields are nullable so the editor can CLEAR them: `null`
  // unsets the field in Sanity, an absent key leaves it untouched.
  email: z.string().trim().email('Must be a valid email').nullable().optional(),
  company: z.string().trim().min(1).nullable().optional(),
  image: imageAssetId.nullable().optional(),
})

export const StaffDeleteSchema = z.object({
  id: z.string().trim().min(1, 'A staff id is required'),
})
