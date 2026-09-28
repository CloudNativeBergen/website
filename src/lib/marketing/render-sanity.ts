import { groq } from 'next-sanity'
import { clientReadUncached } from '@/lib/sanity/client'
import { COUNT_API_VERSION } from '@/lib/sanity/orphaned-asset'
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
  /** The gallery asset the Task was finished with (#1166), if it was. */
  galleryAssetId: string | null
  /**
   * That asset's alt as it was picked, stored on the Task: what a hand-off
   * retry gives the posts, as the first hand-off did, even once the asset
   * is deleted.
   */
  galleryAlt: string | null
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
      handoffDoneFor, replacedRenders, galleryPending,
      "galleryAssetId": galleryAsset._ref,
      "galleryAlt": galleryAlt}`,
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

/**
 * Whether the gallery asset `assetId`, in ANY version (published, a Studio
 * draft, a Content Release copy), still holds the image `file` (#1166). A
 * Task's gallery image is the gallery's only while it does; afterwards a
 * render that replaces it is recorded as the Task's, so a speaker's erasure
 * finds it.
 */
export async function galleryAssetHolds(
  assetId: string,
  file: string,
): Promise<boolean> {
  const count = await clientReadUncached
    .withConfig({ apiVersion: COUNT_API_VERSION })
    .fetch<number>(
      // groq-global-scoped: by id, the asset the caller's Task recorded (written only after its organization guard), and that asset's draft and release copies.
      groq`count(*[_type == "marketingAsset" && (_id == $assetId || _id == $draftId || (_id in path("versions.**") && string::split(_id, ".")[2] == $assetId)) && image.asset._ref == $file])`,
      { assetId, draftId: `drafts.${assetId}`, file },
      { cache: 'no-store', perspective: 'raw' },
    )
  return (count ?? 0) > 0
}
