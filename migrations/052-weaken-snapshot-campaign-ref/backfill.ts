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
      throw new Error(
        `Snapshot ${snapshot._id}: task ${taskRef?._ref} no longer resolves; restore it before migrating`,
      )
    }
    return { ...row, taskKey: task.key }
  })
  return fields
}
