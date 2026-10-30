/** Singular display label for a staff role slug, e.g. `photographer` -> `Photographer`. */
export function staffRoleLabel(role: string): string {
  const words = decodeURIComponent(role).replace(/[-_]+/g, ' ').trim()
  return words.replace(/\b\w/g, (c) => c.toUpperCase())
}

// Collective nouns read as plurals already ("Stage Crew", not "Stage Crews").
const COLLECTIVE = /\b(crew|staff|team)$/i

/** Page title for a staff role: the plural label, e.g. `Photographers`. */
export function staffRoleTitle(role: string): string {
  const label = staffRoleLabel(role)
  return label.endsWith('s') || COLLECTIVE.test(label) ? label : `${label}s`
}
