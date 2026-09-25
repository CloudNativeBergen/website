import 'server-only'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { isSoftOnSocial } from './image-type'
import type { MarketingAssetRow } from './types'

/**
 * `marketingAsset` reads and writes (spec §3). Every read is scoped to ONE
 * organization with the organization filter; an organization-wide asset is
 * `scope == "organization"`, never "has no conference", which the tenancy lint
 * treats as fail-open.
 */

/** This organization's organization-wide assets, newest first. */
export async function listMarketingAssets(
  orgId: string,
): Promise<MarketingAssetRow[]> {
  const rows = await scopedFetch<
    Omit<MarketingAssetRow, 'softOnSocial'>[] | null
  >(
    clientReadUncached,
    { orgId },
    // Published documents only: the client reads `raw`, and a Studio draft
    // would otherwise show as a second, deletable copy.
    `*[_type == "marketingAsset" && scope == "organization" && !(_id in path("drafts.**"))] | order(_createdAt desc){
      _id,
      title,
      alt,
      kind,
      scope,
      "imageUrl": image.asset->url,
      "assetId": image.asset._ref,
      "width": image.asset->metadata.dimensions.width,
      "height": image.asset->metadata.dimensions.height,
      "createdAt": _createdAt
    }`,
    {},
    { cache: 'no-store' },
  )
  return (rows ?? []).map((row) => ({
    ...row,
    softOnSocial: isSoftOnSocial(row),
  }))
}

/**
 * The image asset ids one of this organization's assets holds, published and
 * Studio draft together: a draft may point at a different image, and both go
 * through the orphan check when the asset is deleted.
 */
export async function readMarketingAssetImageIds(
  orgId: string,
  id: string,
): Promise<string[]> {
  const refs = await scopedFetch<(string | null)[] | null>(
    clientReadUncached,
    { orgId },
    `*[_type == "marketingAsset" && _id in [$id, $draftId]].image.asset._ref`,
    { id, draftId: `drafts.${id}` },
    { cache: 'no-store' },
  )
  return [...new Set((refs ?? []).filter((ref): ref is string => !!ref))]
}

export interface NewMarketingAsset {
  orgId: string
  title: string
  alt: string
  imageAssetId: string
}

/** Create an organization-wide uploaded image. The organization is the caller's. */
export async function createMarketingAsset(
  input: NewMarketingAsset,
): Promise<{ _id: string }> {
  const created = await clientWrite.create({
    _type: 'marketingAsset',
    organization: { _type: 'reference', _ref: input.orgId },
    scope: 'organization',
    kind: 'image',
    source: 'upload',
    title: input.title,
    alt: input.alt,
    image: {
      _type: 'image',
      asset: { _type: 'reference', _ref: input.imageAssetId },
    },
  })
  return { _id: created._id }
}

/**
 * Delete one asset document and any Studio draft of it, together: a draft left
 * behind would still reference the image and keep the file alive. The caller
 * has already proven the published id is ours.
 */
export async function deleteMarketingAssetDocument(id: string): Promise<void> {
  await clientWrite.transaction().delete(id).delete(`drafts.${id}`).commit()
}
