import 'server-only'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { isSoftOnSocial } from './image-type'
import { isAttachableToPost } from './post-attach'
import type { ResolvedMarketingAssetDetails } from './details'
import type { StudioOriginInput } from './studio'
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
  "studio": select(source == "studio" && defined(studio.tab) => {
    "tab": studio.tab,
    "speakerId": select(studio.tab == "speakers" && subject->_type == "speaker" => subject._ref, null),
    "sponsorId": select(studio.tab == "sponsors" && subject->_type == "sponsor" => subject._ref, null)
  }, null),
  "mimeType": image.asset->mimeType,
  "usedInPosts": select(defined(image.asset._ref) => count(*[_type == "socialPost" && conference->organization._ref == $orgId && _id in path("*") && references(^.image.asset._ref)]), 0),
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
    | (Omit<MarketingAssetRow, 'softOnSocial' | 'attachable'> & {
        mimeType: string | null
      })[]
    | null
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
  return (rows ?? []).map(({ mimeType, ...row }) => ({
    ...row,
    softOnSocial: isSoftOnSocial(row),
    attachable: isAttachableToPost({ ...row, mimeType }),
  }))
}

/**
 * The subject of the Marketing Task a post belongs to, or null for a post no
 * Task of THIS conference owns. Found through the Task's variant: a post
 * holds no Task reference of its own.
 */
async function readPostSubjectId(
  conferenceId: string,
  postId: string,
): Promise<string | null> {
  return scopedFetch<string | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "marketingTask" && _id in path("*") && defined(subject._ref) && variant->post._ref == $postId][0].subject._ref`,
    { postId },
    { cache: 'no-store' },
  )
}

/** Where a row falls in the picker: lower first. */
function pickerRank(
  row: MarketingAssetRow,
  subjectId: string | null,
  conferenceId: string,
): number {
  if (subjectId && row.subject?._id === subjectId) return 0
  if (row.scope === 'edition' && row.conferenceId === conferenceId) return 1
  if (row.scope === 'organization') return 2
  return 3
}

/**
 * The post editor's "Marketing assets" picker (spec §5): assets about the
 * post's subject first (from any edition), then this edition's, then the
 * organization-wide ones, and — with `editions: "all"` — the older editions
 * last; newest first within each. The gallery's own read does the scoping and
 * the search. Audio tracks never go into a post, so they are not listed; a GIF
 * or video is, marked not attachable.
 */
export async function listMarketingAssetsForPost(
  orgId: string,
  conferenceId: string,
  postId: string,
  filter: Pick<MarketingAssetFilter, 'editions' | 'search'>,
): Promise<MarketingAssetRow[]> {
  const [subjectId, rows] = await Promise.all([
    readPostSubjectId(conferenceId, postId),
    // Always every edition: the subject's assets lead from any of them.
    listMarketingAssets(orgId, conferenceId, {
      editions: 'all',
      search: filter.search,
    }),
  ])
  return rows
    .filter((row) => row.kind !== 'audio')
    .map((row) => ({ row, rank: pickerRank(row, subjectId, conferenceId) }))
    .filter(({ rank }) => rank < 3 || filter.editions === 'all')
    .sort((a, b) => a.rank - b.rank)
    .map(({ row }) => row)
}

/**
 * One of this organization's assets as a post takes it (#1163): the image
 * reference, its crop and hotspot, the alt text, and whether it can go into a
 * post at all. Null when it is not ours. The caller has proven the id ours.
 */
export async function readMarketingAssetForPost(
  orgId: string,
  id: string,
): Promise<{
  imageAssetId: string | null
  alt: string
  hotspot: { x: number; y: number; width: number; height: number } | null
  crop: { top: number; bottom: number; left: number; right: number } | null
  attachable: boolean
} | null> {
  const row = await scopedFetch<{
    kind: string | null
    imageAssetId: string | null
    mimeType: string | null
    alt: string | null
    hotspot: { x: number; y: number; width: number; height: number } | null
    crop: { top: number; bottom: number; left: number; right: number } | null
  } | null>(
    clientReadUncached,
    { orgId },
    `*[_type == "marketingAsset" && _id == $id][0]{
      kind,
      "imageAssetId": image.asset._ref,
      "mimeType": image.asset->mimeType,
      alt,
      "hotspot": image.hotspot{ x, y, width, height },
      "crop": image.crop{ top, bottom, left, right }
    }`,
    { id },
    { cache: 'no-store' },
  )
  if (!row) return null
  return {
    imageAssetId: row.imageAssetId,
    alt: row.alt ?? '',
    hotspot: row.hotspot ?? null,
    crop: row.crop ?? null,
    attachable: isAttachableToPost({
      kind: row.kind,
      assetId: row.imageAssetId,
      mimeType: row.mimeType,
    }),
  }
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
      /** Set when "Save to gallery" in the studio made it (spec §4.2). */
      studio?: StudioOriginInput
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
  const studio = input.kind === 'audio' ? undefined : input.studio
  const created = await clientWrite.create(
    {
      _type: 'marketingAsset',
      organization: { _type: 'reference', _ref: input.orgId },
      source: studio ? 'studio' : 'upload',
      // Only the tab: the speaker or sponsor it was opened on IS the subject,
      // so an edit or an erasure of the subject can never leave a stale copy.
      ...(studio ? { studio: { tab: studio.tab } } : {}),
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
export async function deleteMarketingAssetDocument(
  id: string,
  /** Delete only while the asset is still at this revision. */
  ifRev?: string,
): Promise<void> {
  const tx = clientWrite.transaction()
  // A delete takes no revision guard of its own; a no-op patch on the same
  // document in the same transaction does, and fails it all.
  if (ifRev) tx.patch(id, (p) => p.ifRevisionId(ifRev).unset(['_deleteGuard']))
  await tx.delete(id).delete(`drafts.${id}`).commit()
}

/**
 * The file of one of this organization's audio tracks, for the studio's
 * track route. Null when it is not ours or holds no track (an image). The
 * caller has already proven the id ours.
 */
export async function readMarketingAssetTrack(
  orgId: string,
  id: string,
): Promise<{ url: string | null; fileId: string | null } | null> {
  return scopedFetch<{ url: string | null; fileId: string | null } | null>(
    clientReadUncached,
    { orgId },
    `*[_type == "marketingAsset" && _id == $id && kind == "audio"][0]{
      "url": audio.asset->url,
      "fileId": audio.asset._ref
    }`,
    { id },
    { cache: 'no-store' },
  )
}
