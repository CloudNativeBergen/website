/**
 * SCHEMA SHAPE EXTRACTION — the machinery behind the append-only lock on the
 * document types a SECOND application reads (see
 * `__tests__/sanity/schema-contract.test.ts` and
 * `sanity/schema-shape.baseline.json`).
 *
 * It walks a `defineType` document definition and flattens it to a sorted
 * `path -> type` map. Two properties matter:
 *
 *  - It is DERIVED, never hand-written. The baseline is regenerated from the
 *    real schema modules by `scripts/update-schema-baseline.ts`.
 *  - It is ORDER-INDEPENDENT. Reordering fields is not a breaking change for a
 *    reader, so the shape is a map, not a list; only presence and type count.
 *
 * PATH GRAMMAR
 *   `title`                        top-level field
 *   `theme.primaryColor`           field of an inline object
 *   `domains[string]`              member of an array (keyed by the member's
 *                                  `name`, or its `type` when anonymous)
 *   `ticketTargets.milestones[ticketMilestone].date`
 *
 * KNOWN LIMIT: traversal follows `fields` and `of` only. Portable-text
 * internals reached through `marks.annotations` (rich-text link annotations,
 * for instance) are NOT walked — those are block-content plumbing, not fields a
 * cross-app reader projects. Everything else nests to full depth.
 */

/** The subset of a Sanity field/member definition this walker cares about. */
interface ShapeNode {
  name?: string
  type?: string
  fields?: unknown
  of?: unknown
}

/** A document type flattened to `path -> type`, sorted by path. */
export type SchemaShape = Record<string, string>

function asNodes(value: unknown): ShapeNode[] {
  return Array.isArray(value) ? (value as ShapeNode[]) : []
}

function walk(nodes: ShapeNode[], prefix: string, out: SchemaShape): void {
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue
    const type = typeof node.type === 'string' ? node.type : 'unknown'
    const name = typeof node.name === 'string' ? node.name : undefined
    if (!name) continue
    const path = prefix ? `${prefix}.${name}` : name
    out[path] = type
    walk(asNodes(node.fields), path, out)
    walkMembers(asNodes(node.of), path, out)
  }
}

function walkMembers(members: ShapeNode[], path: string, out: SchemaShape) {
  for (const member of members) {
    if (!member || typeof member !== 'object') continue
    const memberType = typeof member.type === 'string' ? member.type : 'unknown'
    // Array members are keyed by their own `name` when they have one (inline
    // object members do), and otherwise by their type — so `of: [{type:
    // 'string'}]` is stable and two anonymous members of different types never
    // collide.
    const key = typeof member.name === 'string' ? member.name : memberType
    const memberPath = `${path}[${key}]`
    out[memberPath] = memberType
    walk(asNodes(member.fields), memberPath, out)
    walkMembers(asNodes(member.of), memberPath, out)
  }
}

/**
 * Flatten a Sanity document type definition to its sorted `path -> type` shape.
 */
export function describeSchemaShape(documentType: {
  name: string
  fields?: unknown
}): SchemaShape {
  const out: SchemaShape = {}
  walk(asNodes(documentType.fields), '', out)
  return Object.fromEntries(
    Object.keys(out)
      .sort()
      .map((path) => [path, out[path]]),
  )
}

/** A breaking change between the committed baseline and the current schema. */
export interface SchemaShapeDrift {
  /** Paths in the baseline that no longer exist. A rename shows up here. */
  removed: string[]
  /** Paths whose `type` changed. */
  retyped: { path: string; baseline: string; current: string }[]
}

/**
 * Compare a committed baseline against the current shape.
 *
 * ASYMMETRIC BY DESIGN: paths present in `current` but absent from `baseline`
 * are ADDITIONS and are not reported — the lock is append-only, and adding a
 * field breaks no reader. Only removals and type changes are drift.
 */
export function diffSchemaShape(
  baseline: SchemaShape,
  current: SchemaShape,
): SchemaShapeDrift {
  const removed: string[] = []
  const retyped: SchemaShapeDrift['retyped'] = []
  for (const [path, baselineType] of Object.entries(baseline)) {
    if (!(path in current)) {
      removed.push(path)
      continue
    }
    if (current[path] !== baselineType) {
      retyped.push({ path, baseline: baselineType, current: current[path] })
    }
  }
  return { removed, retyped }
}

export function hasSchemaShapeDrift(drift: SchemaShapeDrift): boolean {
  return drift.removed.length > 0 || drift.retyped.length > 0
}

/**
 * The failure message. It carries as much weight as the check itself: whoever
 * trips this is mid-refactor, has never heard of kontroll, and needs to be told
 * both WHY the rule exists and HOW to override it deliberately.
 */
export function formatSchemaShapeDrift(
  documentTypeName: string,
  drift: SchemaShapeDrift,
  baselinePath: string,
): string {
  const lines: string[] = [
    `BREAKING CHANGE to the "${documentTypeName}" document type.`,
    '',
  ]
  if (drift.removed.length > 0) {
    lines.push(`Fields REMOVED (${drift.removed.length}):`)
    for (const path of drift.removed) lines.push(`  - ${path}`)
    lines.push('')
  }
  if (drift.retyped.length > 0) {
    lines.push(`Fields RETYPED (${drift.retyped.length}):`)
    for (const { path, baseline, current } of drift.retyped) {
      lines.push(`  ~ ${path}: ${baseline} -> ${current}`)
    }
    lines.push('')
  }
  lines.push(
    `The "${documentTypeName}" schema is APPEND-ONLY. A SECOND application —`,
    'RunKonf/kontroll, the control panel at my.konf.app — reads these documents',
    'straight out of Sanity. It does not compile against this repository, so',
    'removing or retyping a field does not break its build: it breaks that app',
    'SILENTLY, AT RUNTIME, in production, against live content. Adding fields is',
    'always fine and this test will not complain about it.',
    '',
    'Renaming counts as a removal plus an addition, and fails on the removal.',
    '',
    'IF THE REMOVAL IS INTENDED, this is the escape hatch — the rule is meant to',
    'be overridable, just not accidentally:',
    '',
    '  1. Make sure kontroll no longer reads the field.',
    '  2. Run:  pnpm tsx scripts/update-schema-baseline.ts',
    `  3. Commit the regenerated ${baselinePath} IN THE SAME PR,`,
    '     so a reviewer sees the removal as an explicit line in the diff.',
  )
  return lines.join('\n')
}
