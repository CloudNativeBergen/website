import type { AttemptOutcome, VariantStatus } from '@/lib/social/types'

export interface DeletionVariant {
  _id: string
  _rev: string
  /** The `/go/<code>` code, so a delete can EXPIRE its lookup entry (§2.5). */
  shortCode: string | null
  status: VariantStatus
  /**
   * The last attempt's outcome: a `failed` variant whose last attempt is
   * `ambiguous` or `stale-claim` may be live on the platform (#1128), and
   * deleting it would erase the only record an organizer can reconcile from.
   */
  lastOutcome: AttemptOutcome | null
  postId: string | null
  ownPost: boolean
  siblingVariantIds: string[]
  survivingTaskIds: string[]
}
export interface DeletionTask {
  _id: string
  _rev: string
  /**
   * Outreach Kinds: the `/go/<code>` code. Deleting the Task sends a link that
   * may be live to the home page (§2.1's known hole), so its cached lookup
   * must be expired rather than left to age out (§2.5).
   */
  shortCode: string | null
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
  /**
   * Campaigns or Tasks that exist ONLY as `drafts.<id>` — created in the Studio
   * and never published — and belong to this plan or one of its Campaigns. The
   * tree read excludes every draft path by design, so these are invisible to
   * it, and their owner reference is weak, so nothing stops the delete either.
   * Refused rather than deleted: unpublished work the organizer has not seen is
   * not something a delete may silently discard.
   */
  draftOnlyRecords: number
  /**
   * Weak `prerequisites` pointing into the delete set from a holder the delete
   * does not unlink — a draft twin, a Content Release version, or a Task on
   * another edition.
   *
   * Counted apart from `strongOwnerRefs` because the remedies differ: migration
   * 052 clears the latter and cannot touch this, so reporting them together
   * told the organizer to run a migration that would change nothing.
   */
  danglingPrerequisites: number
  /**
   * Documents outside the delete that still use a social post or variant it
   * would remove — a draft-only sibling variant, a Content Release version, a
   * Task on another edition — or a `versions.<release>.<id>` twin of that
   * media itself.
   *
   * Counted apart from `strongOwnerRefs` for the same reason as
   * `danglingPrerequisites`: migration 052 does not clear these, it MAKES
   * them, by weakening exactly the references Sanity used to refuse on. Only a
   * person can decide what the holder should point at instead.
   */
  heldMedia: number
}
export interface DeletionPreview {
  campaigns: number
  tasks: number
  publishedTasks: number
  requiresTypedConfirmation: boolean
  snapshots: number
}
