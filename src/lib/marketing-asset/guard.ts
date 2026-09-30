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

/**
 * What a speaker erasure will find an exported video by (#1182): the files
 * it showed. Two client claims, each proven before it is believed:
 *
 *  - the project it was exported from, proven THIS organization's by the
 *    tenancy guard before anything of it is read — the refusal never says
 *    whether a foreign id exists — and then the backgrounds it holds now;
 *  - the backgrounds the editor knew at export time: a gallery asset id,
 *    resolved to its file by an organization-scoped read where a foreign or
 *    deleted one is simply absent, never refused; or a bare file id, taken
 *    as given.
 *
 * A bare id is TAKEN, not proven, on purpose. The lineage is inert: plain
 * strings that only ever make THIS video deletable when an erasure deletes
 * a file they name. Naming a file that is not ours costs the namer their
 * own video and nobody else anything, so proving it would guard nothing —
 * while refusing it loses the case the lineage exists for: a photo the
 * project has since dropped, whose gallery entry is gone too, still shown
 * by the export. The shape alone is checked, by the schema.
 *
 * The union, so an edit or a save that follows the export hides nothing.
 * Never a gallery asset that is not an image: a track is heard, not shown.
 */
export async function resolveVideoLineage(
  orgId: string,
  origin: { projectId?: string; sources?: ExportSourceInput[] },
): Promise<{ sourceFileIds: string[] }> {
  const held: string[] = []
  if (origin.projectId) {
    await requireDocumentInCurrentOrg(origin.projectId, 'videoProject')
    const stored = await readVideoProjectFiles(orgId, origin.projectId)
    for (const image of stored?.images ?? []) held.push(image.fileId)
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
      .map((row) => [row._id, row.fileId as string]),
  )
  const shown = sources.flatMap((s) => {
    const fromGallery = s.galleryAssetId
      ? gallery.get(s.galleryAssetId)
      : undefined
    if (fromGallery) return [fromGallery]
    return s.fileId ? [s.fileId] : []
  })
  return { sourceFileIds: [...new Set([...held, ...shown])] }
}
