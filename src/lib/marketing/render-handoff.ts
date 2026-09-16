/** The Campaign siblings eligible to consume a studio render. */
export interface RenderHandoffSibling {
  _id: string
  kind: string
  prerequisiteIds: string[]
  variantId: string | null
}

export function renderHandoffRecipients(
  renderTaskId: string,
  siblings: RenderHandoffSibling[],
): RenderHandoffSibling[] {
  return siblings.filter(
    (task) =>
      task.kind === 'publishing' &&
      task.variantId !== null &&
      task.prerequisiteIds.includes(renderTaskId),
  )
}

export function renderAlt(task: {
  alt: string | null
  title: string
  subjectName: string | null
}): string {
  return (
    task.alt?.trim() ||
    [task.title.trim() || 'Conference promotion', task.subjectName?.trim()]
      .filter(Boolean)
      .join(' — ')
  )
}
