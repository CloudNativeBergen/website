import { clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import type { RenderHandoffSibling } from './render-handoff'

export interface StudioTask {
  _id: string
  _rev: string
  kind: string
  title: string
  alt: string | null
  subjectName: string | null
  pendingAssetId: string | null
  assetId: string | null
  campaignId: string
}

/** Called only after the request's by-id tenancy guard. */
export function getStudioTask(taskId: string, conferenceId: string) {
  return scopedFetch<StudioTask | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "marketingTask" && _id == $taskId][0]{_id, _rev, kind, title, alt,
      "subjectName": coalesce(subject->name, subject->title),
      "pendingAssetId": pendingStudioAsset.asset._ref, "assetId": asset.asset._ref,
      "campaignId": campaign._ref}`,
    { taskId },
    { cache: 'no-store' },
  )
}

export function getRenderSiblings(campaignId: string, conferenceId: string) {
  return scopedFetch<RenderHandoffSibling[]>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "marketingTask" && campaign._ref == $campaignId && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]{_id, kind,
      "prerequisiteIds": coalesce(prerequisites[]._ref, []), "variantId": variant._ref}`,
    { campaignId },
    { cache: 'no-store' },
  )
}
