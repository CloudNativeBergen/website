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
 * Coverage note: the shape walker follows `fields` and `of` to full depth, so
 * inline objects and arrays-of-objects (including the homepage section blocks
 * and their nested arrays) ARE covered. Portable-text internals reached via
 * `marks.annotations` are NOT walked; they are block-content plumbing, not
 * fields any cross-app reader projects.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import conference from '../../sanity/schemaTypes/conference'
import {
  LOCKED_DOCUMENT_TYPES,
  SCHEMA_SHAPE_BASELINE_PATH,
} from '../../sanity/lib/lockedSchemas'
import {
  describeSchemaShape,
  diffSchemaShape,
  formatSchemaShapeDrift,
  hasSchemaShapeDrift,
  type SchemaShape,
} from '../../sanity/lib/schemaShape'
import { CONFERENCE_CONTRACT_FIELDS } from '@/lib/conference/contract'

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
      const current = describeSchemaShape(LOCKED_DOCUMENT_TYPES[typeName])
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
            '(my.konf.app) runs to list an organization’s conferences. Ten',
            'fields out of ~160 — this is the tightest part of the contract and',
            'the least forgiving: the field is gone, so kontroll now reads null',
            'for it in production.',
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

  it('captures the real conference schema at depth, not just the top level', () => {
    const shape = baseline.conference
    const paths = Object.keys(shape)
    expect(paths.length).toBeGreaterThan(200)
    // Nested proof: an array-of-objects member field, three levels down.
    expect(
      shape['homepageSections[homepageFaq].items[homepageFaqItem].answer'],
    ).toBe('text')
  })
})
