import { clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'

/** A sponsor subject is a company; messaging needs its edition relationship. */
export function resolveOutreachSponsor(
  subjectId: string,
  conferenceId: string,
) {
  return scopedFetch<{ _id: string; name: string } | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "sponsorForConference" && sponsor._ref == $subjectId && sponsor->_type == "sponsor" && !(_id in path("drafts.**")) && !(_id in path("versions.**"))] | order(_id asc) [0]{_id, "name": sponsor->name}`,
    { subjectId },
    { cache: 'no-store' },
  )
}

/** Only read after the campaign's by-id tenancy guard. */
export function getOutreachCampaign(campaignId: string, conferenceId: string) {
  return scopedFetch<{
    _id: string
    key: string
    planId: string
    /** The plan revision this validation read saw — see `createMarketingTask`. */
    planRev: string | null
    ownerId: string | null
  } | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "marketingCampaign" && _id == $campaignId && plan->conference._ref == $conferenceId && !(_id in path("drafts.**")) && !(_id in path("versions.**"))][0]{_id, key, "planId": plan._ref, "planRev": plan->_rev, "ownerId": plan->owner._ref}`,
    { campaignId },
    { cache: 'no-store' },
  )
}
