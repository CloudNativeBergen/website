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

export interface RedateOutcome {
  /**
   * Whether the re-date RAN. False means it could not be completed — it threw,
   * or compare-and-set lost twice — so the plan's stored dates may still be
   * stale.
   *
   * This has to be reported, not inferred: every failure path returns no moved
   * ids and no warnings, which is byte-identical to a plan that was already
   * where it belongs. A caller that needs the dates to be current — the
   * expansion cron allocates new post slots from existing Tasks' stored dates —
   * cannot tell the two apart without it, and would happily allocate against
   * positions the Tasks are about to leave.
   *
   * A conference with NO PLAN is `true`: the dates are current, there just were
   * none to move. A plan whose conference cannot be read is `false` — its Tasks
   * are anchored to Milestones that could not be resolved.
   */
  ok: boolean
  movedTaskIds: string[]
  movedVariantIds: string[]
  warnings: string[]
}

/**
 * The warnings a settings save should show the organizer.
 *
 * A save never fails because re-dating did — the setting IS saved, and the
 * nightly cron retries — but the organizer was told nothing at all, so a plan
 * left on its old dates looked like a plan that needed no moving.
 */
export function redateWarnings(outcome: RedateOutcome): string[] {
  return outcome.ok
    ? outcome.warnings
    : [
        ...outcome.warnings,
        'Saved, but the Marketing Plan could not be re-dated just now. Tonight’s run will move its Tasks.',
      ]
}

export async function redatePlanForConference(
  conferenceId: string,
): Promise<RedateOutcome> {
  const failed = {
    ok: false,
    movedTaskIds: [],
    movedVariantIds: [],
    warnings: [],
  }
  const nothingToDo = { ...failed, ok: true }
  let snapshot: RedatablePlanSnapshot | null = null
  let committed = false
  const rotateFailedPlan = async () => {
    if (!snapshot || committed) return
    try {
      // Only the plan is touched; its revision still serializes this attempt.
      // Broken source data must not monopolize the cron's first 50 slots.
      // A false return is a REVISION conflict, which means another re-dater
      // committed and stamped the plan already — rotation happened, just not
      // by us. Logged rather than swallowed so a plan that never rotates is
      // visible instead of silently sitting at the front of the queue.
      if (!(await applyRedates({ tasks: [], campaigns: [] }, snapshot)))
        console.warn('Marketing re-date rotation stamp conflicted', {
          conferenceId,
        })
    } catch (error) {
      console.error('Marketing re-date rotation failed', {
        conferenceId,
        error,
      })
    }
  }
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      // Drop the previous attempt's snapshot BEFORE re-reading. If this read
      // throws, a stale snapshot would otherwise survive into the catch, and
      // the rotation stamp would compare-and-set against a revision that is
      // already dead — failing silently and leaving the plan permanently at
      // the front of the cron's rotation.
      snapshot = null
      snapshot = await getRedatablePlan(conferenceId)
      if (!snapshot?.conference) {
        await rotateFailedPlan()
        // No plan at all is genuinely nothing to re-date. A plan whose
        // CONFERENCE could not be read is not: its Tasks may be anchored to
        // Milestones nobody can resolve right now, so their dates may well be
        // stale and a caller that needs them current must not assume otherwise.
        return snapshot ? failed : nothingToDo
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
      return { ok: true, movedTaskIds, movedVariantIds, warnings }
    }
    // Rotate here too. Exiting the loop without stamping left the plan sorted
    // to the FRONT of the cron's queue on every run, so a persistently
    // contended plan consumed a slot for ever — the starvation the rotation
    // exists to prevent, closed only for the throwing path.
    console.error('Marketing re-date conflicted twice', { conferenceId })
    await rotateFailedPlan()
  } catch (error) {
    console.error('Marketing re-date failed', { conferenceId, error })
    await rotateFailedPlan()
  }
  return failed
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
