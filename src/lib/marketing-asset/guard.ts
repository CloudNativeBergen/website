import 'server-only'
import { TRPCError } from '@trpc/server'
import { readMarketingAssetMark } from './sanity'
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
