import { clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import type { RenderHandoffSibling } from './render-handoff'
import {
  MARKETING_ASSET_SUBJECT_TYPES,
  type MarketingAssetSubjectType,
} from '@/lib/marketing-asset/types'

export interface StudioTask {
  _id: string
  _rev: string
  kind: string
  title: string
  alt: string | null
  subjectName: string | null
  /** The subject a gallery entry is about (#1165). */
  subject: { id: string; type: MarketingAssetSubjectType } | null
  pendingAssetId: string | null
  assetId: string | null
  campaignId: string
  handoffDoneFor: string[] | null
  /** Replaced renders not yet deleted (#1162); see `./replaced-renders`. */
  replacedRenders: string[] | null
  /** Set by the save of a new render until its gallery save lands (#1165). */
  galleryPending: boolean | null
}

/** Called only after the request's by-id tenancy guard. */
export function getStudioTask(taskId: string, conferenceId: string) {
  return scopedFetch<StudioTask | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "marketingTask" && _id == $taskId][0]{_id, _rev, kind, title, alt,
      "subjectName": coalesce(subject->name, subject->title),
      "subject": select(subject->_type in $subjectTypes => { "id": subject._ref, "type": subject->_type }),
      "pendingAssetId": pendingStudioAsset.asset._ref, "assetId": asset.asset._ref,
      "campaignId": campaign._ref,
      handoffDoneFor, replacedRenders, galleryPending}`,
    { taskId, subjectTypes: [...MARKETING_ASSET_SUBJECT_TYPES] },
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
