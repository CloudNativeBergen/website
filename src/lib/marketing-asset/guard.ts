import 'server-only'
import { TRPCError } from '@trpc/server'
import { readMarketingAssetMark } from './sanity'
import {
  readGalleryFiles,
  readVideoProjectFiles,
} from '@/lib/video-project/sanity'
import {
  requireCurrentOrgId,
  requireDocumentInCurrentOrg,
  requireSpeakerInCurrentOrg,
} from '@/server/tenancy'
import { resolveConferenceId } from '@/server/trpc'
import type {
  ParsedMarketingAssetDetails,
  ResolvedMarketingAssetDetails,
} from './details'
import type { ExportSourceInput } from './studio'

/**
 * Resolve and validate an asset's details on write (spec §3), BEFORE anything
 * is written or moved:
 *
 *  - the edition is never taken from the client. `current` is the request
 *    host's edition; `keep` is the mark the asset already carries (`assetId`,
 *    which the caller has proven ours), re-checked as an edition of THIS
 *    organization, since Studio could have set it to anything;
 *  - a speaker subject must have standing here (speakers are shared across
 *    tenants: membership or a talk at one of our editions);
 *  - a talk or sponsor subject must belong to this organization.
 *
 * Each tenancy refusal is the guard's own NOT_FOUND, which never says whether
 * a foreign id exists.
 */
export async function resolveAssetDetailsForCurrentOrg(
  details: ParsedMarketingAssetDetails,
  assetId?: string,
): Promise<ResolvedMarketingAssetDetails> {
  const { edition, ...rest } = details
  let mark: ResolvedMarketingAssetDetails
  if (edition === 'current') {
    mark = {
      ...rest,
      scope: 'edition',
      conferenceId: await resolveConferenceId(),
    }
  } else if (edition === 'keep') {
    const kept = assetId
      ? await readMarketingAssetMark(await requireCurrentOrgId(), assetId)
      : null
    if (!kept)
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'This asset has no edition to keep. Choose one.',
      })
    await requireDocumentInCurrentOrg(kept, 'conference')
    mark = { ...rest, scope: 'edition', conferenceId: kept }
  } else {
    mark = { ...rest, scope: 'organization' }
  }
  const subject = details.subject
  if (subject?.type === 'speaker') await requireSpeakerInCurrentOrg(subject.id)
  else if (subject) await requireDocumentInCurrentOrg(subject.id, subject.type)
  return mark
}

/** One background an exported video showed, as the entry records it. */
export interface ResolvedExportSource {
  fileId: string
  /**
   * The gallery asset it came from — named only where the file is PROVEN
   * that asset's: its image now, or a file the proven project holds under
   * it. A bare file carries neither this nor a subject.
   */
  galleryAssetId?: string
  /**
   * Who that gallery asset said it showed, copied as a saved video copies
   * it: what an erasure finds the file by once the asset is gone.
   */
  subjectId?: string
}

/**
 * What a speaker erasure will find an exported video by (#1182): the files
 * it showed, each with the gallery asset it came from and who that asset
 * said it showed. Two client claims, each proven before it is believed:
 *
 *  - the project it was exported from, proven THIS organization's by the
 *    tenancy guard before anything of it is read — the refusal never says
 *    whether a foreign id exists — and then the backgrounds it holds now,
 *    with the entry and subject each carries (proven when it was saved);
 *  - the backgrounds the editor knew at export time: a gallery asset id,
 *    resolved by an organization-scoped read where a foreign or deleted one
 *    is simply absent, never refused, and a file id.
 *
 * A SUBJECT IS COPIED ONLY ONTO A FILE PROVEN TO BE THAT ASSET'S — the
 * asset's image now, or a file the proven project holds under that asset.
 * The copy is what links the FILE to a person at erasure, and a file linked
 * to a person is deleted everywhere it is held, in every tenant; a subject
 * copied onto a file an organizer merely named would let them have any
 * file, anyone's, deleted at the next erasure of their own speaker. So a
 * file that cannot be proven the asset's is recorded BARE: no asset, no
 * subject. Bare, it is inert — it only ever makes THIS video deletable
 * when an erasure deletes that file for reasons of its own — so it is
 * taken as given; the schema checks its shape. What that leaves out: an
 * unsaved video whose entry's image was swapped in Studio between the pick
 * and this save records the old file bare, and nothing links it to the
 * person but the entry's subject, which the swap detached.
 *
 * The union, so an edit or a save that follows the export hides nothing.
 * Never a gallery asset that is not an image: a track is heard, not shown.
 */
export async function resolveVideoLineage(
  orgId: string,
  origin: { projectId?: string; sources?: ExportSourceInput[] },
): Promise<{ sources: ResolvedExportSource[] }> {
  const found: ResolvedExportSource[] = []
  /** Files the proven project holds, by file and the entry it holds it under. */
  const heldUnder = new Map<string, { subjectId: string | null }>()
  const under = (fileId: string, galleryAssetId: string) =>
    `${fileId}\u0000${galleryAssetId}`
  if (origin.projectId) {
    await requireDocumentInCurrentOrg(origin.projectId, 'videoProject')
    const stored = await readVideoProjectFiles(orgId, origin.projectId)
    for (const image of stored?.images ?? []) {
      if (image.galleryAssetId)
        heldUnder.set(under(image.fileId, image.galleryAssetId), {
          subjectId: image.subjectId,
        })
      found.push({
        fileId: image.fileId,
        ...(image.galleryAssetId
          ? { galleryAssetId: image.galleryAssetId }
          : {}),
        // Proven when the project was saved, entry or no entry.
        ...(image.subjectId ? { subjectId: image.subjectId } : {}),
      })
    }
  }
  const sources = origin.sources ?? []
  const galleryIds = [
    ...new Set(
      sources.flatMap((s) => (s.galleryAssetId ? [s.galleryAssetId] : [])),
    ),
  ]
  const gallery = new Map(
    (await readGalleryFiles(orgId, galleryIds))
      .filter((row) => row.kind === 'image' && row.fileId)
      .map((row) => [row._id, row]),
  )
  for (const s of sources) {
    const row = s.galleryAssetId ? gallery.get(s.galleryAssetId) : undefined
    const fileId = s.fileId ?? row?.fileId ?? null
    if (!fileId) continue
    const proven =
      s.galleryAssetId &&
      (row?.fileId === fileId
        ? { subjectId: row.subjectId }
        : heldUnder.get(under(fileId, s.galleryAssetId)))
    if (proven && s.galleryAssetId)
      found.push({
        fileId,
        galleryAssetId: s.galleryAssetId,
        ...(proven.subjectId ? { subjectId: proven.subjectId } : {}),
      })
    else found.push({ fileId })
  }
  // One entry per file and gallery asset; the first mention's subject wins.
  const seen = new Set<string>()
  return {
    sources: found.filter((s) => {
      const key = `${s.fileId}\u0000${s.galleryAssetId ?? ''}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }),
  }
}
