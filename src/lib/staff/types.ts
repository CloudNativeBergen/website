export interface Staff {
  id: string
  name: string
  role: string
  email?: string
  company?: string
  imageURL?: URL
  link: URL
}

/**
 * Admin projection of a staff document (SE-4). Unlike {@link Staff}, this keeps
 * the raw image ASSET id (needed to re-submit an unchanged image on edit) and
 * uses plain strings so it round-trips cleanly through tRPC.
 */
export interface StaffAdmin {
  _id: string
  name: string
  role: string
  email?: string
  company?: string
  link: string
  /** Sanity image asset id (`image-…`), or undefined when no image is set. */
  imageAssetId?: string
  /** Resolved asset URL for preview, or undefined when no image is set. */
  imageURL?: string
}
