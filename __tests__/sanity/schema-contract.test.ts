/**
 * THE APPEND-ONLY LOCK on the Sanity document types a SECOND application reads.
 *
 * `RunKonf/kontroll` (the control panel at my.konf.app) reads `conference` and
 * reads/writes `organization` directly out of Sanity. It does not compile
 * against this repository, so the type system cannot catch a field this repo
 * deletes or retypes — the other app just starts returning `undefined` in
 * production. This test is the only thing standing between a routine schema
 * tidy-up and that outage.
 *
 * Rules enforced here:
 *   - ADDING a field passes. Always. The lock is append-only, not frozen.
 *   - REMOVING a field fails.
 *   - CHANGING a field's `type` fails.
 *   - RENAMING is a removal plus an addition, and fails on the removal.
 *   - Every field named in the cross-app projection
 *     (`src/lib/conference/contract.ts`) must still exist — the tightest part
 *     of the contract, with its own failure message.
 *
 * Escape hatch: `pnpm tsx scripts/update-schema-baseline.ts`, committed in the
 * same PR. See `formatSchemaShapeDrift` for the message a failure prints.
 *
 * Coverage note: the walker follows `fields` and `of`, and ALSO resolves a
 * field whose `type` names a separately registered schema type (`richTextCode`
 * and the rest of the rich-text vocabulary) by looking it up in the Studio's
 * own type list — so `richTextCode.code` is inside the lock, not merely the
 * reference to it. Cycles are stopped by a per-path guard on type names.
 * Portable-text internals reached via `marks.annotations` are NOT walked; they
 * are block-content plumbing, not fields any cross-app reader projects.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import conference from '../../sanity/schemaTypes/conference'
import {
  LOCKED_DOCUMENT_TYPES,
  SCHEMA_SHAPE_BASELINE_PATH,
  SCHEMA_TYPE_REGISTRY,
} from '../../sanity/lib/lockedSchemas'
import {
  buildSchemaTypeRegistry,
  describeSchemaShape,
  diffSchemaShape,
  formatSchemaShapeDrift,
  hasSchemaShapeDrift,
  type SchemaShape,
} from '../../sanity/lib/schemaShape'
import {
  CONFERENCE_CONTRACT_FIELDS,
  CONFERENCE_LIST_PROJECTION,
} from '@/lib/conference/contract'

const REPO_ROOT = resolve(__dirname, '../..')

const baseline: Record<string, SchemaShape> = JSON.parse(
  readFileSync(resolve(REPO_ROOT, SCHEMA_SHAPE_BASELINE_PATH), 'utf8'),
)

describe('locked Sanity document types', () => {
  it('has a committed baseline for every locked document type', () => {
    expect(Object.keys(baseline).sort()).toEqual(
      Object.keys(LOCKED_DOCUMENT_TYPES).sort(),
    )
  })

  it.each(Object.keys(LOCKED_DOCUMENT_TYPES))(
    '"%s" is append-only: no field removed, no field retyped',
    (typeName) => {
      const current = describeSchemaShape(
        LOCKED_DOCUMENT_TYPES[typeName],
        SCHEMA_TYPE_REGISTRY,
      )
      const drift = diffSchemaShape(baseline[typeName], current)
      if (hasSchemaShapeDrift(drift)) {
        throw new Error(
          formatSchemaShapeDrift(typeName, drift, SCHEMA_SHAPE_BASELINE_PATH),
        )
      }
      expect(hasSchemaShapeDrift(drift)).toBe(false)
    },
  )
})

describe('cross-app conference read contract', () => {
  const topLevelFields = new Set(
    (conference.fields as { name?: string }[])
      .map((field) => field.name)
      .filter((name): name is string => typeof name === 'string'),
  )

  it.each(CONFERENCE_CONTRACT_FIELDS)(
    'conference schema still defines "%s", named by the kontroll projection',
    (fieldName) => {
      if (!topLevelFields.has(fieldName)) {
        throw new Error(
          [
            `MISSING CONTRACT FIELD: "${fieldName}" is named by the cross-app`,
            'projection in src/lib/conference/contract.ts, but no longer exists',
            'on the "conference" document type.',
            '',
            'That projection is the exact GROQ the kontroll control panel',
            `(my.konf.app) runs to list an organization’s conferences: ${CONFERENCE_CONTRACT_FIELDS.length}`,
            `schema fields out of ${topLevelFields.size} top-level, plus the system field _id.`,
            'This is the tightest part of the contract and the least forgiving —',
            'the field is gone, so kontroll now reads null for it in production.',
            '',
            'Either restore the field, or remove it from',
            'CONFERENCE_CONTRACT_FIELDS and CONFERENCE_LIST_PROJECTION in',
            'src/lib/conference/contract.ts, ship the kontroll change first, and',
            'regenerate the schema baseline in the same PR:',
            '',
            '  pnpm tsx scripts/update-schema-baseline.ts',
          ].join('\n'),
        )
      }
      expect(topLevelFields.has(fieldName)).toBe(true)
    },
  )

  // Guards the contract's own documentation against the off-by-one it already
  // had once: ten projection ENTRIES, nine SCHEMA fields, because `_id` is a
  // system field on every document rather than something the schema declares.
  it('names nine schema fields; the tenth projection entry is _id', () => {
    expect(CONFERENCE_CONTRACT_FIELDS).toHaveLength(9)
    expect(CONFERENCE_CONTRACT_FIELDS).not.toContain('_id')
    expect(CONFERENCE_LIST_PROJECTION).toContain('_id')
    for (const fieldName of CONFERENCE_CONTRACT_FIELDS) {
      expect(CONFERENCE_LIST_PROJECTION).toContain(fieldName)
    }
  })
})

/**
 * A lock that cannot fail is decoration. These exercise the comparison itself
 * against synthetic shapes, so the four directions are proven in CI rather than
 * only by hand at review time.
 */
describe('drift detection (the lock can actually fail)', () => {
  const before: SchemaShape = { title: 'string', city: 'string' }

  it('passes when a field is ADDED', () => {
    const after: SchemaShape = { ...before, newField: 'string' }
    expect(hasSchemaShapeDrift(diffSchemaShape(before, after))).toBe(false)
  })

  it('fails when a field is REMOVED', () => {
    const drift = diffSchemaShape(before, { title: 'string' })
    expect(drift.removed).toEqual(['city'])
    expect(hasSchemaShapeDrift(drift)).toBe(true)
  })

  it('fails when a field is RETYPED', () => {
    const drift = diffSchemaShape(before, { title: 'text', city: 'string' })
    expect(drift.retyped).toEqual([
      { path: 'title', baseline: 'string', current: 'text' },
    ])
    expect(hasSchemaShapeDrift(drift)).toBe(true)
  })

  it('fails on the REMOVAL half of a rename', () => {
    const drift = diffSchemaShape(before, { title: 'string', town: 'string' })
    expect(drift.removed).toEqual(['city'])
  })

  it('detects removals nested inside objects and arrays', () => {
    const nestedBefore: SchemaShape = {
      theme: 'object',
      'theme.primaryColor': 'string',
      'items[row].label': 'string',
    }
    const drift = diffSchemaShape(nestedBefore, {
      theme: 'object',
      'items[row].label': 'string',
    })
    expect(drift.removed).toEqual(['theme.primaryColor'])
  })

  it('explains why the rule exists and how to override it', () => {
    const message = formatSchemaShapeDrift(
      'conference',
      diffSchemaShape(before, { title: 'string' }),
      SCHEMA_SHAPE_BASELINE_PATH,
    )
    expect(message).toContain('APPEND-ONLY')
    expect(message).toContain('kontroll')
    expect(message).toContain('SILENTLY, AT RUNTIME')
    expect(message).toContain('scripts/update-schema-baseline.ts')
    expect(message).toContain('IN THE SAME PR')
  })
})

describe('schema shape extraction', () => {
  it('flattens nested objects and array members to typed paths', () => {
    const shape = describeSchemaShape({
      name: 'sample',
      fields: [
        { name: 'title', type: 'string' },
        {
          name: 'theme',
          type: 'object',
          fields: [{ name: 'primaryColor', type: 'string' }],
        },
        { name: 'domains', type: 'array', of: [{ type: 'string' }] },
        {
          name: 'rows',
          type: 'array',
          of: [
            {
              type: 'object',
              name: 'row',
              fields: [{ name: 'label', type: 'string' }],
            },
          ],
        },
      ],
    })
    expect(shape).toEqual({
      title: 'string',
      theme: 'object',
      'theme.primaryColor': 'string',
      domains: 'array',
      'domains[string]': 'string',
      rows: 'array',
      'rows[row]': 'object',
      'rows[row].label': 'string',
    })
  })

  it('resolves fields whose type is a separately registered type', () => {
    const registry = buildSchemaTypeRegistry([
      {
        name: 'codeBlock',
        type: 'object',
        fields: [
          { name: 'code', type: 'text' },
          { name: 'language', type: 'string' },
        ],
      },
    ])
    const shape = describeSchemaShape(
      {
        name: 'sample',
        fields: [{ name: 'body', type: 'array', of: [{ type: 'codeBlock' }] }],
      },
      registry,
    )
    expect(shape).toEqual({
      body: 'array',
      'body[codeBlock]': 'codeBlock',
      'body[codeBlock].code': 'text',
      'body[codeBlock].language': 'string',
    })
  })

  it('captures the named type at its own entry only when no registry is given', () => {
    const shape = describeSchemaShape({
      name: 'sample',
      fields: [{ name: 'body', type: 'array', of: [{ type: 'codeBlock' }] }],
    })
    expect(shape).toEqual({ body: 'array', 'body[codeBlock]': 'codeBlock' })
  })

  it('stops at the first repeat of a type on the path (cycle guard)', () => {
    // `richText` embeds `callout`, and `callout` embeds `richText` again — the
    // exact shape that would recurse forever without the guard.
    const registry = buildSchemaTypeRegistry([
      {
        name: 'richText',
        type: 'array',
        of: [{ type: 'callout' }],
      },
      {
        name: 'callout',
        type: 'object',
        fields: [
          { name: 'title', type: 'string' },
          { name: 'nested', type: 'richText' },
        ],
      },
    ])
    const shape = describeSchemaShape(
      { name: 'sample', fields: [{ name: 'body', type: 'richText' }] },
      registry,
    )
    // One full expansion, then the repeat of `richText` is recorded but not
    // descended into — so the walk terminates instead of hanging.
    expect(shape).toEqual({
      body: 'richText',
      'body[callout]': 'callout',
      'body[callout].title': 'string',
      'body[callout].nested': 'richText',
    })
  })

  it('stops when a document type embeds itself', () => {
    const registry = buildSchemaTypeRegistry([
      {
        name: 'node',
        type: 'object',
        fields: [
          { name: 'label', type: 'string' },
          { name: 'child', type: 'node' },
        ],
      },
    ])
    const shape = describeSchemaShape(
      { name: 'node', fields: registry.node.fields },
      registry,
    )
    expect(shape).toEqual({ label: 'string', child: 'node' })
  })

  it('captures the real conference schema at depth, not just the top level', () => {
    const shape = baseline.conference
    const paths = Object.keys(shape)
    expect(paths.length).toBeGreaterThan(200)
    // Nested proof: an array-of-objects member field, three levels down.
    expect(
      shape['homepageSections[homepageFaq].items[homepageFaqItem].answer'],
    ).toBe('text')
    // Named-type proof: `richTextCode` is registered separately in
    // sanity/schema.ts and carries no inline fields at the reference site.
    // Without registry resolution this path would not exist at all.
    expect(
      shape['homepageSections[homepageRichText].content[richTextCode].code'],
    ).toBe('text')
  })
})
