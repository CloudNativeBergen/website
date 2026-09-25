/** One gallery entry as the page shows it. */
export interface MarketingAssetRow {
  _id: string
  title: string
  alt: string
  kind: 'image'
  scope: 'organization' | 'edition'
  imageUrl: string | null
  assetId: string | null
  width: number | null
  height: number | null
  createdAt: string
  /** Short side under 1080 px: may look soft on social. A warning only. */
  softOnSocial: boolean
}
