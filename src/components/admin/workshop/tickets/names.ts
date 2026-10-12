/** “A”, “B” and “C”, for copy that names ticket types. */
export function quoteNames(names: readonly string[]): string {
  const quoted = names.map((name) => `“${name}”`)
  if (quoted.length <= 2) return quoted.join(' and ')
  return `${quoted.slice(0, -1).join(', ')} and ${quoted.at(-1)}`
}
