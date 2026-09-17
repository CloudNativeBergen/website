/** Resolve every historical join BEFORE weakening any reference. Existing
 * denormalized values (including null targets) are immutable on repeat runs. */
export function backfillSnapshot(
  snapshot: Record<string, unknown>,
  documents: Map<string, Record<string, unknown>>,
): Record<string, unknown> {
  const reference = snapshot.campaign as { _ref: string }
  const campaign = documents.get(reference?._ref)
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
  const rows = (snapshot.perTask ?? []) as Record<string, unknown>[]
  fields.perTask = rows.map((row) => {
    if (typeof row.taskKey === 'string' && row.taskKey) return row
    const taskRef = row.task as { _ref?: string } | undefined
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
