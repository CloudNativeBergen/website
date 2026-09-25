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
    // Published documents only (`path("*")` is a root id with no dot): the
    // client reads `raw`, and a Studio draft or a Content Release version
    // would otherwise show as a second, deletable copy.
    `*[_type == "marketingAsset" && scope == "organization" && _id in path("*")] | order(_createdAt desc){
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
 * The image one of this organization's assets holds, and whether this
 * gallery's upload CREATED that image. Sanity deduplicates identical bytes
 * across the whole dataset, so an upload can be handed another tenant's
 * existing asset; only one this gallery created is ever its to delete.
 */
export async function readMarketingAssetImage(
  orgId: string,
  id: string,
): Promise<{ assetId: string | null; createdByUpload: boolean } | null> {
  const row = await scopedFetch<{
    assetId: string | null
    createdImageAssetId: string | null
  } | null>(
    clientReadUncached,
    { orgId },
    `*[_type == "marketingAsset" && _id == $id][0]{
      "assetId": image.asset._ref,
      "createdImageAssetId": createdImageAssetId
    }`,
    { id },
    { cache: 'no-store' },
  )
  if (!row) return null
  return {
    assetId: row.assetId,
    // The upload created THIS image: a later swap (Studio) to any other
    // asset, possibly another tenant's, is never the gallery's to delete.
    createdByUpload: !!row.assetId && row.createdImageAssetId === row.assetId,
  }
}

/**
 * How many Content Release versions (`versions.<release>.<id>`) of one of this
 * organization's assets exist. Counted at an API version whose `raw`
 * perspective includes release versions; the clients' own (2023-05-03) does
 * not see them at all.
 */
export async function countMarketingAssetReleaseTwins(
  orgId: string,
  id: string,
): Promise<number> {
  const result = await scopedFetch<{ n: number } | null>(
    clientReadUncached.withConfig({
      apiVersion: '2025-02-19',
      perspective: 'raw',
    }),
    { orgId },
    `{ "n": count(*[_type == "marketingAsset" && _id in path("versions.*." + $id)]) }`,
    { id },
    { cache: 'no-store' },
  )
  return result?.n ?? 0
}

export interface NewMarketingAsset {
  orgId: string
  title: string
  alt: string
  imageAssetId: string
  /**
   * The image asset this upload CREATED, or undefined when Sanity handed back
   * one it already held (identical bytes, possibly another tenant's).
   */
  createdImageAssetId?: string
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
    ...(input.createdImageAssetId
      ? { createdImageAssetId: input.createdImageAssetId }
      : {}),
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
