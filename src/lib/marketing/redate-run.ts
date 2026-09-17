/**
 * Re-date on settings writes and the daily Studio-edit backstop. The plan CAS
 * serializes re-daters without modifying the shared conference document.
 * Accepted source race: a milestone write followed by approval can freeze an
 * older snapshot before that write's synchronous re-date runs. Guarding the
 * conference would require patching it on every run; the agreed design accepts
 * this narrow interval rather than bumping that cross-application document.
 * A task restored to exactly plannedAt intentionally follows the plan again.
 */
import { ceilingWarningsFor } from './ceiling-check'
import { resolveAllMilestones } from './milestones'
import { planRedates } from './redate'
import {
  applyRedates,
  getRedatablePlan,
  getRedateCandidates,
  type RedatablePlanSnapshot,
} from './redate-sanity'

const MAX_REDATE_CONFERENCES_PER_RUN = 50

export async function redatePlanForConference(conferenceId: string): Promise<{
  movedTaskIds: string[]
  movedVariantIds: string[]
  warnings: string[]
}> {
  const empty = { movedTaskIds: [], movedVariantIds: [], warnings: [] }
  let snapshot: RedatablePlanSnapshot | null = null
  let committed = false
  const rotateFailedPlan = async () => {
    if (!snapshot || committed) return
    try {
      // Only the plan is touched; its revision still serializes this attempt.
      // Broken source data must not monopolize the cron's first 50 slots.
      await applyRedates({ tasks: [], campaigns: [] }, snapshot)
    } catch (error) {
      console.error('Marketing re-date rotation failed', {
        conferenceId,
        error,
      })
    }
  }
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      snapshot = await getRedatablePlan(conferenceId)
      if (!snapshot?.conference) {
        await rotateFailedPlan()
        return empty
      }
      const plan = planRedates({
        milestones: resolveAllMilestones(snapshot.conference),
        tasks: snapshot.tasks,
        campaigns: snapshot.campaigns,
      })
      if (!(await applyRedates(plan, snapshot))) continue
      committed = true
      const movedTaskIds = plan.tasks.map((task) => task.taskId)
      const movedVariantIds = plan.tasks.flatMap((task) =>
        task.variant ? [task.variant.id] : [],
      )
      const warnings = movedVariantIds.length
        ? await ceilingWarningsFor(conferenceId, {
            variantIds: movedVariantIds,
          })
        : []
      return { movedTaskIds, movedVariantIds, warnings }
    }
    console.error('Marketing re-date conflicted twice', { conferenceId })
  } catch (error) {
    console.error('Marketing re-date failed', { conferenceId, error })
    await rotateFailedPlan()
  }
  return empty
}

export async function resolveRedateConferences(): Promise<
  { planId: string; conferenceId: string }[]
> {
  return (await getRedateCandidates())
    .sort(
      (a, b) =>
        (a.lastRedatedAt ?? '').localeCompare(b.lastRedatedAt ?? '') ||
        a.planId.localeCompare(b.planId),
    )
    .slice(0, MAX_REDATE_CONFERENCES_PER_RUN)
    .map(({ planId, conferenceId }) => ({ planId, conferenceId }))
}
