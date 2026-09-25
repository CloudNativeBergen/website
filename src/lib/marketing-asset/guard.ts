import 'server-only'
import {
  requireDocumentInCurrentOrg,
  requireSpeakerInCurrentOrg,
} from '@/server/tenancy'
import type { ParsedMarketingAssetDetails } from './details'

/**
 * Validated on write (spec §3): an edition mark must be an edition of THIS
 * organization; a speaker subject must have standing here (speakers are shared
 * across tenants, so membership or a talk at one of our editions); a talk or
 * sponsor subject must belong to this organization. Each refusal is the
 * tenancy guard's own NOT_FOUND, which never says whether a foreign id exists.
 *
 * Call it BEFORE anything is written or moved.
 */
export async function requireAssetDetailsInCurrentOrg(
  details: Pick<
    ParsedMarketingAssetDetails,
    'scope' | 'conferenceId' | 'subject'
  >,
): Promise<void> {
  if (details.scope === 'edition' && details.conferenceId)
    await requireDocumentInCurrentOrg(details.conferenceId, 'conference')
  const subject = details.subject
  if (!subject) return
  if (subject.type === 'speaker') await requireSpeakerInCurrentOrg(subject.id)
  else await requireDocumentInCurrentOrg(subject.id, subject.type)
}
