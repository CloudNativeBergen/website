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
}
export interface DeletionPreview {
  campaigns: number
  tasks: number
  publishedTasks: number
  requiresTypedConfirmation: boolean
  snapshots: number
}
