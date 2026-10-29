/** Singular display label for a staff role slug, e.g. `photographer` -> `Photographer`. */
export function staffRoleLabel(role: string): string {
  const words = decodeURIComponent(role).replace(/[-_]+/g, ' ').trim()
  return words.replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Page title for a staff role: the plural label, e.g. `Photographers`. */
export function staffRoleTitle(role: string): string {
  const label = staffRoleLabel(role)
  return label.endsWith('s') ? label : `${label}s`
}
