import type { VariantStatus } from '@/lib/social/types'

export interface DeletionVariant {
  _id: string
  _rev: string
  status: VariantStatus
  postId: string | null
  ownPost: boolean
  siblingVariantIds: string[]
  survivingTaskIds: string[]
}
export interface DeletionTask {
  _id: string
  _rev: string
  variant: DeletionVariant | null
  /** Whether `drafts.<_id>` exists, so its prerequisites can be cleared too. */
  hasDraftTwin: boolean
  survivingDependantIds: string[]
}
export interface DeletionTree {
  plan: { _id: string; _rev: string }
  campaigns: { _id: string; _rev: string; key: string }[]
  tasks: DeletionTask[]
  snapshots: number
  /**
   * Strong `campaign`/`plan` references still pointing into this tree from
   * documents we do not delete. Non-zero means Sanity would refuse the delete
   * after the Task chunks had already committed, so it is refused up front.
   */
  strongOwnerRefs: number
  /**
   * Snapshots in scope with no `campaignKey`, i.e. whose Campaign metadata
   * migration 052's backfill pass has not copied onto them yet. Non-zero means
   * deleting would strip their only remaining attribution. Reference strength
   * does NOT imply this is zero: the two migration passes are deliberately
   * independent, so a run that weakens references and then fails leaves the
   * preflight's reference check satisfied and the history still unpreserved.
   */
  unpreservedSnapshots: number
}
export interface DeletionPreview {
  campaigns: number
  tasks: number
  publishedTasks: number
  requiresTypedConfirmation: boolean
  snapshots: number
}
