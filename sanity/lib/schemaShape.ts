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
 * NAMED TYPES ARE RESOLVED. A field whose `type` is a SEPARATELY REGISTERED
 * schema type (`richTextCode`, say) carries no inline `fields`, so walking only
 * what is written at the reference site would capture the reference and none of
 * its internals — and deleting `richTextCode.code` would slip through the lock
 * unnoticed. Pass the registry (see `describeSchemaShape`) and the walker looks
 * the type up and continues underneath it.
 *
 * CYCLE GUARD: resolving named types can loop — `blockContent` embeds types
 * that embed `blockContent` again, and a self-referencing type would recurse
 * forever. The walker therefore carries the SET OF TYPE NAMES ALREADY RESOLVED
 * ON THE CURRENT PATH and refuses to resolve one a second time. The repeat
 * still gets its own `path -> type` entry (so removing the field is caught);
 * only the descent stops. The guard is per-path, not global: the same named
 * type appearing under two different fields is expanded under both.
 *
 * KNOWN LIMIT: traversal follows `fields` and `of`. Portable-text internals
 * reached through `marks.annotations` (rich-text link annotations, for
 * instance) are NOT walked — those are block-content plumbing, not fields a
 * cross-app reader projects.
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

/**
 * Registered schema types by name, so a `type: 'richTextCode'` reference can be
 * expanded into that type's own fields. Build one with
 * {@link buildSchemaTypeRegistry}.
 */
export type SchemaTypeRegistry = Record<string, ShapeNode>

function asNodes(value: unknown): ShapeNode[] {
  return Array.isArray(value) ? (value as ShapeNode[]) : []
}

/** Index a list of registered schema type definitions by `name`. */
export function buildSchemaTypeRegistry(types: unknown): SchemaTypeRegistry {
  const registry: SchemaTypeRegistry = {}
  for (const type of asNodes(types)) {
    if (type && typeof type.name === 'string') registry[type.name] = type
  }
  return registry
}

interface WalkContext {
  out: SchemaShape
  registry: SchemaTypeRegistry
  /** Named types already resolved on the path being walked — the cycle guard. */
  resolving: ReadonlySet<string>
}

/**
 * Continue the walk underneath a node, through both what is written inline at
 * the reference site AND — when the node's `type` names a registered type that
 * is not already being resolved on this path — that type's own definition.
 */
function descend(
  node: ShapeNode,
  type: string,
  path: string,
  ctx: WalkContext,
) {
  walk(asNodes(node.fields), path, ctx)
  walkMembers(asNodes(node.of), path, ctx)

  const named = ctx.registry[type]
  if (!named || ctx.resolving.has(type)) return
  const nested: WalkContext = {
    ...ctx,
    resolving: new Set([...ctx.resolving, type]),
  }
  walk(asNodes(named.fields), path, nested)
  walkMembers(asNodes(named.of), path, nested)
}

function walk(nodes: ShapeNode[], prefix: string, ctx: WalkContext): void {
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue
    const type = typeof node.type === 'string' ? node.type : 'unknown'
    const name = typeof node.name === 'string' ? node.name : undefined
    if (!name) continue
    const path = prefix ? `${prefix}.${name}` : name
    ctx.out[path] = type
    descend(node, type, path, ctx)
  }
}

function walkMembers(members: ShapeNode[], path: string, ctx: WalkContext) {
  for (const member of members) {
    if (!member || typeof member !== 'object') continue
    const memberType = typeof member.type === 'string' ? member.type : 'unknown'
    // Array members are keyed by their own `name` when they have one (inline
    // object members do), and otherwise by their type — so `of: [{type:
    // 'string'}]` is stable and two anonymous members of different types never
    // collide.
    const key = typeof member.name === 'string' ? member.name : memberType
    const memberPath = `${path}[${key}]`
    ctx.out[memberPath] = memberType
    descend(member, memberType, memberPath, ctx)
  }
}

/**
 * Flatten a Sanity document type definition to its sorted `path -> type` shape.
 *
 * Pass `registry` (from {@link buildSchemaTypeRegistry}) to expand references to
 * separately registered types; without it, such a reference is captured at its
 * own entry only and its internals are not walked.
 */
export function describeSchemaShape(
  documentType: { name: string; fields?: unknown },
  registry: SchemaTypeRegistry = {},
): SchemaShape {
  const out: SchemaShape = {}
  // The document type itself seeds the cycle guard: a type embedding itself
  // (directly or through another type) stops at the first repeat.
  walk(asNodes(documentType.fields), '', {
    out,
    registry,
    resolving: new Set([documentType.name]),
  })
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
