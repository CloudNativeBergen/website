import 'server-only'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { isSoftOnSocial } from './image-type'
import type { ParsedMarketingAssetDetails } from './details'
import type {
  MarketingAssetFacets,
  MarketingAssetFilter,
  MarketingAssetRow,
  MarketingAssetSubject,
} from './types'

/**
 * `marketingAsset` reads and writes (spec §3). Every read is scoped to ONE
 * organization with the organization filter; an organization-wide asset is
 * `scope == "organization"`, never "has no conference", which the tenancy lint
 * treats as fail-open.
 */

/** An asset's subject: a talk by its title, a speaker or sponsor by name. */
const SUBJECT_PROJECTION = `subject->{ _id, _type, "name": select(_type == "talk" => title, name) }`

/** The projection every gallery row is read with. */
const ROW_PROJECTION = `{
  _id,
  title,
  alt,
  kind,
  scope,
  "conferenceId": select(scope == "edition" => conference._ref, null),
  "edition": select(scope == "edition" => conference->title, null),
  "subject": ${SUBJECT_PROJECTION},
  "tags": coalesce(tags, []),
  "credit": coalesce(credit, null),
  "imageUrl": image.asset->url,
  "assetId": image.asset._ref,
  "width": image.asset->metadata.dimensions.width,
  "height": image.asset->metadata.dimensions.height,
  "createdAt": _createdAt
}`

/**
 * A search box's words as GROQ `match` terms: each a prefix, every one
 * required. `*` is the only wildcard `match` knows; one typed in is dropped
 * rather than passed on as a wildcard of the organizer's own.
 */
export function searchTerms(search: string | undefined): string[] | null {
  const words = (search ?? '')
    .replace(/\*/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 10)
    .map((word) => `${word.slice(0, 50)}*`)
  return words.length > 0 ? words : null
}

/**
 * The gallery (spec §3): by default this edition's assets and the
 * organization-wide ones, newest first; `editions: "all"` adds this
 * organization's other editions. Filters narrow within that.
 *
 * ONE read, scoped to the organization by `scopedFetch`. Within it the
 * organization-wide half is `scope == "organization"` and the edition half
 * `conference._ref == $conferenceId` — never "has no conference", which the
 * tenancy lint refuses as fail-open. An asset of another organization never
 * reaches the scope clause at all, even one pointing at our edition.
 */
export async function listMarketingAssets(
  orgId: string,
  conferenceId: string,
  filter: MarketingAssetFilter,
): Promise<MarketingAssetRow[]> {
  const rows = await scopedFetch<
    Omit<MarketingAssetRow, 'softOnSocial'>[] | null
  >(
    clientReadUncached,
    { orgId },
    // Published documents only (`path("*")` is a root id with no dot): the
    // client reads `raw`, and a Studio draft or a Content Release version
    // would otherwise show as a second, deletable copy.
    `*[_type == "marketingAsset" && _id in path("*")
      && (scope == "organization" || (scope == "edition" && ($allEditions || conference._ref == $conferenceId)))
      && ($subjectId == null || subject._ref == $subjectId)
      && ($tag == null || count(coalesce(tags, [])[lower(@) == $tag]) > 0)
      && ($terms == null || ([title] + coalesce(tags, [])) match $terms)
    ] | order(_createdAt desc) ${ROW_PROJECTION}`,
    {
      conferenceId,
      allEditions: filter.editions === 'all',
      subjectId: filter.subjectId || null,
      tag: filter.tag?.trim().toLowerCase() || null,
      terms: searchTerms(filter.search),
    },
    { cache: 'no-store' },
  )
  return (rows ?? []).map((row) => ({
    ...row,
    softOnSocial: isSoftOnSocial(row),
  }))
}

/**
 * What the filter menus offer: every tag and subject on this organization's
 * assets, across all editions, so a filter never hides its own options.
 */
export async function listMarketingAssetFacets(
  orgId: string,
): Promise<MarketingAssetFacets> {
  const rows = await scopedFetch<
    { tags: string[] | null; subject: MarketingAssetSubject | null }[] | null
  >(
    clientReadUncached,
    { orgId },
    `*[_type == "marketingAsset" && _id in path("*")]{
      tags,
      "subject": ${SUBJECT_PROJECTION}
    }`,
    {},
    { cache: 'no-store' },
  )
  const tags = new Set<string>()
  const subjects = new Map<string, MarketingAssetSubject>()
  for (const row of rows ?? []) {
    // Lower-cased as the filter compares them: Studio can write any case.
    for (const tag of row.tags ?? []) if (tag) tags.add(tag.toLowerCase())
    if (row.subject?._id && row.subject.name)
      subjects.set(row.subject._id, row.subject)
  }
  return {
    tags: [...tags].sort((a, b) => a.localeCompare(b)),
    subjects: [...subjects.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
  }
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
  /** Shape-checked, and proven this organization's by the caller. */
  details: ParsedMarketingAssetDetails
  imageAssetId: string
  /**
   * The image asset this upload CREATED, or undefined when Sanity handed back
   * one it already held (identical bytes, possibly another tenant's).
   */
  createdImageAssetId?: string
}

/** Create an uploaded image. The organization is the caller's. */
export async function createMarketingAsset(
  input: NewMarketingAsset,
  options: { signal?: AbortSignal } = {},
): Promise<{ _id: string }> {
  // A new document has nothing to unset.
  const { set } = detailsPatch(input.details)
  const created = await clientWrite.create(
    {
      _type: 'marketingAsset',
      organization: { _type: 'reference', _ref: input.orgId },
      kind: 'image',
      source: 'upload',
      ...set,
      image: {
        _type: 'image',
        asset: { _type: 'reference', _ref: input.imageAssetId },
      },
      ...(input.createdImageAssetId
        ? { createdImageAssetId: input.createdImageAssetId }
        : {}),
    },
    { signal: options.signal },
  )
  return { _id: created._id }
}

/**
 * The describing fields of an asset as `set`/`unset` patch operations: an
 * organization-wide asset carries no edition, and a subject or credit taken
 * away is removed rather than left empty. The subject is a WEAK reference, so
 * the person, talk or sponsor it names can still be merged or deleted.
 */
export function detailsPatch(details: ParsedMarketingAssetDetails): {
  set: Record<string, unknown>
  unset: string[]
} {
  const set: Record<string, unknown> = {
    title: details.title,
    alt: details.alt,
    scope: details.scope,
    tags: details.tags,
  }
  const unset: string[] = []
  if (details.scope === 'edition' && details.conferenceId)
    set.conference = { _type: 'reference', _ref: details.conferenceId }
  else unset.push('conference')
  if (details.subject)
    set.subject = {
      _type: 'reference',
      _ref: details.subject.id,
      _weak: true,
    }
  else unset.push('subject')
  if (details.credit) set.credit = details.credit
  else unset.push('credit')
  return { set, unset }
}

/** Rewrite an asset's details. The caller has proven the id and details ours. */
export async function updateMarketingAssetDetails(
  id: string,
  details: ParsedMarketingAssetDetails,
): Promise<void> {
  const { set, unset } = detailsPatch(details)
  await clientWrite.patch(id).set(set).unset(unset).commit()
}

/**
 * Delete one asset document and any Studio draft of it, together: a draft left
 * behind would still reference the image and keep the file alive. The caller
 * has already proven the published id is ours.
 */
export async function deleteMarketingAssetDocument(id: string): Promise<void> {
  await clientWrite.transaction().delete(id).delete(`drafts.${id}`).commit()
}
