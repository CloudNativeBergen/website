import 'server-only'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { isSoftOnSocial } from './image-type'
import type { ResolvedMarketingAssetDetails } from './details'
import type {
  MarketingAssetFacets,
  MarketingAssetKind,
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
  "alt": coalesce(alt, null),
  "kind": coalesce(kind, "image"),
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
  "createdAt": _createdAt,
  "audioUrl": audio.asset->url,
  "durationSeconds": durationSeconds,
  "rights": select(defined(rightsConfirmation.confirmedAt) => {
    "confirmedBy": rightsConfirmation.confirmedBy->name,
    "confirmedAt": rightsConfirmation.confirmedAt
  }, null)
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
      && ($kind == null || coalesce(kind, "image") == $kind)
      && ($subjectId == null || subject._ref == $subjectId)
      && ($tag == null || count(coalesce(tags, [])[lower(@) == $tag]) > 0)
      && ($terms == null || ([title] + coalesce(tags, [])) match $terms)
    ] | order(_createdAt desc) ${ROW_PROJECTION}`,
    {
      conferenceId,
      allEditions: filter.editions === 'all',
      kind: filter.kind ?? null,
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
 * The edition one of this organization's assets is marked with now, or null
 * when it is organization-wide (or not ours). Published documents only.
 */
export async function readMarketingAssetMark(
  orgId: string,
  id: string,
): Promise<string | null> {
  const row = await scopedFetch<{ conferenceId: string | null } | null>(
    clientReadUncached,
    { orgId },
    `*[_type == "marketingAsset" && _id == $id][0]{
      "conferenceId": select(scope == "edition" => conference._ref, null)
    }`,
    { id },
    { cache: 'no-store' },
  )
  return row?.conferenceId ?? null
}

/**
 * The kind of one of this organization's assets, the image or audio file it
 * holds, and whether this gallery's upload CREATED that file. Sanity
 * deduplicates identical bytes across the whole dataset, so an upload can be
 * handed another tenant's existing asset; only one this gallery created is
 * ever its to delete.
 */
export async function readMarketingAssetMedia(
  orgId: string,
  id: string,
): Promise<{
  kind: MarketingAssetKind
  assetId: string | null
  createdByUpload: boolean
} | null> {
  const row = await scopedFetch<{
    kind: MarketingAssetKind
    assetId: string | null
    createdAssetId: string | null
  } | null>(
    clientReadUncached,
    { orgId },
    `*[_type == "marketingAsset" && _id == $id][0]{
      "kind": coalesce(kind, "image"),
      "assetId": select(kind == "audio" => audio.asset._ref, image.asset._ref),
      "createdAssetId": select(kind == "audio" => createdFileAssetId, createdImageAssetId)
    }`,
    { id },
    { cache: 'no-store' },
  )
  if (!row) return null
  return {
    kind: row.kind,
    assetId: row.assetId,
    // The upload created THIS file: a later swap (Studio) to any other
    // asset, possibly another tenant's, is never the gallery's to delete.
    createdByUpload: !!row.assetId && row.createdAssetId === row.assetId,
  }
}

/**
 * The image one of this organization's assets holds, with its size, for a
 * studio background. Null when it is not ours; `url` is null when it holds no
 * image (an audio track). The caller has already proven the id ours.
 */
export async function readMarketingAssetBackground(
  orgId: string,
  id: string,
): Promise<{
  title: string
  alt: string
  url: string | null
  width: number | null
  height: number | null
} | null> {
  return scopedFetch(
    clientReadUncached,
    { orgId },
    `*[_type == "marketingAsset" && _id == $id][0]{
      title,
      "alt": coalesce(alt, ""),
      "url": image.asset->url,
      "width": image.asset->metadata.dimensions.width,
      "height": image.asset->metadata.dimensions.height
    }`,
    { id },
    { cache: 'no-store' },
  )
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

export type NewMarketingAsset = {
  orgId: string
  /** Resolved, and proven this organization's, by the caller. */
  details: ResolvedMarketingAssetDetails
} & (
  | {
      kind?: 'image'
      imageAssetId: string
      /**
       * The image asset this upload CREATED, or undefined when Sanity handed
       * back one it already held (identical bytes, possibly another tenant's).
       */
      createdImageAssetId?: string
    }
  | {
      kind: 'audio'
      fileAssetId: string
      /** As `createdImageAssetId`, for the track's file. */
      createdFileAssetId?: string
      durationSeconds: number
      /** The organizer who confirmed, and the server's time of it. */
      rights: { confirmedBy: string; confirmedAt: string }
    }
)

/** Create an uploaded image or track. The organization is the caller's. */
export async function createMarketingAsset(
  input: NewMarketingAsset,
  options: { signal?: AbortSignal } = {},
): Promise<{ _id: string }> {
  // A new document has nothing to unset.
  const { set } = detailsPatch(input.details)
  // An audio track has no alt text, whatever the details carried.
  if (input.kind === 'audio') delete set.alt
  const media: Record<string, unknown> =
    input.kind === 'audio'
      ? {
          kind: 'audio',
          audio: {
            _type: 'file',
            asset: { _type: 'reference', _ref: input.fileAssetId },
          },
          ...(input.createdFileAssetId
            ? { createdFileAssetId: input.createdFileAssetId }
            : {}),
          durationSeconds: input.durationSeconds,
          rightsConfirmation: {
            confirmedBy: {
              _type: 'reference',
              _ref: input.rights.confirmedBy,
              _weak: true,
            },
            confirmedAt: input.rights.confirmedAt,
          },
        }
      : {
          kind: 'image',
          image: {
            _type: 'image',
            asset: { _type: 'reference', _ref: input.imageAssetId },
          },
          ...(input.createdImageAssetId
            ? { createdImageAssetId: input.createdImageAssetId }
            : {}),
        }
  const created = await clientWrite.create(
    {
      _type: 'marketingAsset',
      organization: { _type: 'reference', _ref: input.orgId },
      source: 'upload',
      ...set,
      ...media,
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
export function detailsPatch(details: ResolvedMarketingAssetDetails): {
  set: Record<string, unknown>
  unset: string[]
} {
  const set: Record<string, unknown> = {
    title: details.title,
    scope: details.scope,
    tags: details.tags,
  }
  const unset: string[] = []
  // Absent only for an audio track, which never has any.
  if (details.alt) set.alt = details.alt
  else unset.push('alt')
  if (details.scope === 'edition')
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
  details: ResolvedMarketingAssetDetails,
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
