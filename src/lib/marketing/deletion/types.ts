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
  survivingDependantIds: string[]
}
export interface DeletionTree {
  plan: { _id: string; _rev: string }
  campaigns: { _id: string; _rev: string; key: string }[]
  tasks: DeletionTask[]
  snapshots: number
  /**
   * Snapshots still holding a STRONG `campaign` reference — i.e. written
   * before migration 052, or by a writer that predates it. Sanity refuses to
   * delete a document a strong reference points at, so any non-zero value here
   * makes the Campaign chunk of the delete impossible.
   */
  strongSnapshots: number
  /**
   * Strong `campaign`/`plan` references still pointing into this tree from
   * documents we do not delete. Non-zero means Sanity would refuse the delete
   * after the Task chunks had already committed, so it is refused up front.
   */
  strongOwnerRefs: number
}
export interface DeletionPreview {
  campaigns: number
  tasks: number
  publishedTasks: number
  requiresTypedConfirmation: boolean
  snapshots: number
}
