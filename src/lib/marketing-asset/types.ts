/** What an asset can be about (spec §3): a speaker, a talk or a sponsor. */
export const MARKETING_ASSET_SUBJECT_TYPES = [
  'speaker',
  'talk',
  'sponsor',
] as const
export type MarketingAssetSubjectType =
  (typeof MARKETING_ASSET_SUBJECT_TYPES)[number]

/** An asset's subject as the gallery shows it: a talk's title, or a name. */
export interface MarketingAssetSubject {
  _id: string
  _type: MarketingAssetSubjectType
  name: string
}

export type MarketingAssetScope = 'organization' | 'edition'

/** One gallery entry as the page shows it. */
export interface MarketingAssetRow {
  _id: string
  title: string
  alt: string
  kind: 'image'
  scope: MarketingAssetScope
  /** The edition an edition asset is marked with; null when organization-wide. */
  conferenceId: string | null
  /** That edition's title. */
  edition: string | null
  /** Null when there is none, or it no longer resolves (a weak reference). */
  subject: MarketingAssetSubject | null
  tags: string[]
  credit: string | null
  imageUrl: string | null
  assetId: string | null
  width: number | null
  height: number | null
  createdAt: string
  /** Short side under 1080 px: may look soft on social. A warning only. */
  softOnSocial: boolean
}

/** Which assets the gallery shows. Every field narrows; none widens. */
export interface MarketingAssetFilter {
  /**
   * `current` (the default): this edition's assets and the organization-wide
   * ones. `all`: every edition of this organization as well.
   */
  editions?: 'current' | 'all'
  subjectId?: string
  /** One whole tag. */
  tag?: string
  /** Words matched as prefixes against the title and tags; all required. */
  search?: string
}

/** What the gallery's filter menus offer. */
export interface MarketingAssetFacets {
  tags: string[]
  subjects: MarketingAssetSubject[]
}

/** Title, alt text and the describing fields, as an organizer sets them. */
export interface MarketingAssetDetails {
  title: string
  alt: string
  scope: MarketingAssetScope
  /** Required when `scope` is `edition`, and must be absent otherwise. */
  conferenceId?: string
  subject?: { type: MarketingAssetSubjectType; id: string } | null
  tags: string[]
  credit?: string
}
