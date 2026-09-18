/** Resolve every historical join BEFORE weakening any reference. Existing
 * denormalized values (including null targets) are immutable on repeat runs. */
export function backfillSnapshot(
  snapshot: Record<string, unknown>,
  documents: Map<string, Record<string, unknown>>,
): Record<string, unknown> {
  const reference = snapshot.campaign as { _ref?: string } | undefined
  // A Snapshot with no `campaign` at all — a half-filled Studio draft — has
  // nothing to weaken and nothing to attribute. It used to throw "restore the
  // Campaign from backup", which is not actionable for a document that never
  // had one, and because deletion refuses until this migration completes, one
  // such draft made every plan permanently undeletable. Skip it.
  if (!reference?._ref) return {}
  const campaign = documents.get(reference._ref)
  const fields: Record<string, unknown> = {
    campaign: { ...reference, _weak: true },
  }
  for (const [stored, source] of Object.entries({
    campaignKey: 'key',
    campaignTitle: 'title',
    campaignPrimaryOutcome: 'primaryOutcome',
    campaignTarget: 'target',
    campaignStartDate: 'startDate',
    campaignEndDate: 'endDate',
  })) {
    if (Object.hasOwn(snapshot, stored)) continue
    if (
      !campaign ||
      (campaign.conference as { _ref?: string } | undefined)?._ref !==
        (snapshot.conference as { _ref?: string } | undefined)?._ref
    ) {
      throw new Error(
        `Snapshot ${snapshot._id}: campaign no longer resolves in its conference; restore it before migrating`,
      )
    }
    const value = campaign[source]
    if (source !== 'target' && (typeof value !== 'string' || !value)) {
      throw new Error(`Snapshot ${snapshot._id}: campaign ${source} is missing`)
    }
    fields[stored] = value ?? null
  }
  // A row whose Task is already gone is NOT a reason to refuse the migration.
  // `task.delete` has existed since the plan shipped and the `perTask.task`
  // reference is weak, so dangling rows are expected in any dataset with
  // history — and a hard throw here would block the whole migration, and with
  // it deletion, on data nobody can restore. There is no key left to recover;
  // the Report already renders such a row as "Deleted Task"
  // (`report/model.ts`). Leave it keyless and carry on. An unresolvable
  // CAMPAIGN still throws above: without its key and title the entire snapshot
  // becomes unattributable, which is the loss this migration exists to prevent.
  //
  // This pass ALSO weakens each row's `task` reference. It used to re-emit the
  // rows straight from the raw document, and because the Snapshot pass is
  // yielded after the owner-reference pass, that overwrote the `_weak: true`
  // the other pass had just set — so every stored `perTask[].task` stayed
  // strong however many times 052 ran. A unit test on `weakenOwnerRefs` alone
  // could not see it; only running both passes in order could.
  const rows = (snapshot.perTask ?? []) as Record<string, unknown>[]
  fields.perTask = rows.map((raw) => {
    const taskRef = raw.task as { _ref?: string; _weak?: boolean } | undefined
    const row = taskRef?._ref
      ? { ...raw, task: { ...taskRef, _weak: true } }
      : raw
    if (typeof row.taskKey === 'string' && row.taskKey) return row
    const task = taskRef?._ref ? documents.get(taskRef._ref) : undefined
    if (
      !task ||
      typeof task.key !== 'string' ||
      !task.key ||
      (task.conference as { _ref?: string } | undefined)?._ref !==
        (snapshot.conference as { _ref?: string } | undefined)?._ref
    ) {
      return row
    }
    return { ...row, taskKey: task.key }
  })
  return fields
}

/**
 * The owner references a Task, Campaign or post variant holds, made weak.
 *
 * `marketingTask.campaign`, `marketingTask.plan` and `marketingCampaign.plan`
 * were STRONG, so Sanity refused to delete the target while any referrer
 * existed — and because deletion commits its Task chunks first, a referrer that
 * the preflight failed to enumerate destroyed the Tasks and then wedged the
 * plan for good. Three review rounds each found a different class of referrer
 * (unpublished drafts, content-release versions, documents belonging to another
 * edition). Weakening the reference removes the failure mode instead of the
 * latest instance of it. Returns `null` when there is nothing to change, so a
 * re-run is a no-op.
 */
export function weakenOwnerRefs(
  document: Record<string, unknown>,
): Record<string, unknown> | null {
  const fields: Record<string, unknown> = {}
  // Every reference the schema now declares weak, including the two that live
  // inside arrays. A list of only the top-level trio left `variant`,
  // `prerequisites[]`, `perTask[].task` and `copiedFrom` strong for ever —
  // four of the nine, and three of them permanent rather than window-limited.
  for (const name of ['campaign', 'plan', 'post', 'variant', 'copiedFrom']) {
    const reference = document[name] as
      { _ref?: string; _weak?: boolean } | undefined
    if (reference?._ref && reference._weak !== true)
      fields[name] = { ...reference, _weak: true }
  }
  const prerequisites = document.prerequisites as
    { _ref?: string; _weak?: boolean }[] | undefined
  if (prerequisites?.some((entry) => entry?._ref && entry._weak !== true))
    fields.prerequisites = prerequisites.map((entry) =>
      entry?._ref ? { ...entry, _weak: true } : entry,
    )
  const perTask = document.perTask as
    { task?: { _ref?: string; _weak?: boolean } }[] | undefined
  if (perTask?.some((row) => row?.task?._ref && row.task._weak !== true))
    fields.perTask = perTask.map((row) =>
      row?.task?._ref ? { ...row, task: { ...row.task, _weak: true } } : row,
    )
  return Object.keys(fields).length > 0 ? fields : null
}
