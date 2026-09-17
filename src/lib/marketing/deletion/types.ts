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
   * Documents we do NOT delete that hold a strong reference into what we do —
   * every Content Release version, plus any Studio draft with no published
   * twin. Non-empty means the delete would destroy the Tasks and then be
   * refused, so it is refused up front instead.
   */
  blockingDocIds: string[]
}
export interface DeletionPreview {
  campaigns: number
  tasks: number
  publishedTasks: number
  requiresTypedConfirmation: boolean
  snapshots: number
}
