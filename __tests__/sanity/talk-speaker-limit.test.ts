/**
 * The per-format speaker limit on `talk.speakers` must be ADVISORY.
 *
 * Sanity takes a validation marker's level from the Rule, never from the object
 * a `.custom()` returns — `{message, level: 'warning'}` type-checks (it
 * structurally satisfies `LocalizedValidationMessages`) and still produces
 * `level: 'error'`. Only `Rule.warning().custom(...)` downgrades it. This test
 * runs the REAL schema through Sanity's own `validateDocument`, so a stub can't
 * make a broken rule look fine.
 */
import { describe, it, expect } from 'vitest'
import { createSchema, validateDocument } from 'sanity'
import { schema } from '../../sanity/schema'
import { Format } from '@/lib/proposal/types'

const compiled = createSchema({
  name: 'test',
  types: [
    ...schema.types,
    // `inlineSvg` comes from a Studio plugin, not this repo's schema list.
    // Without a stand-in, createSchema fails and silently validates nothing.
    {
      name: 'inlineSvg',
      type: 'object',
      fields: [{ name: 'svg', type: 'text' }],
    },
  ],
})

if (compiled._validation?.length) {
  throw new Error(
    `test schema failed to compile: ${JSON.stringify(compiled._validation)}`,
  )
}

function speakerRefs(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    _type: 'reference' as const,
    _key: `k${i}`,
    _ref: `speaker-${i}`,
  }))
}

async function validateSpeakers(format: Format, count: number) {
  const markers = await validateDocument({
    document: {
      _id: 'talk-1',
      _type: 'talk',
      title: 'A talk',
      format,
      speakers: speakerRefs(count),
    },
    // Minimum viable stand-in for a resolved Studio workspace: the real schema,
    // a passthrough translator, and "every reference exists" so nothing needs a
    // Sanity client.
    workspace: {
      schema: compiled,
      i18n: {
        currentLocale: { id: 'en-US' },
        t: (key: string) => key,
        loadNamespaces: async () => {},
      },
      getClient: () => {
        throw new Error('no client expected')
      },
    },
    getDocumentExists: async () => true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)

  return markers.filter(
    (m: { path?: unknown[] }) =>
      (m.path as string[] | undefined)?.[0] === 'speakers',
  )
}

describe('talk.speakers validation', () => {
  it('warns (does not error) when the format limit is exceeded', async () => {
    // lightning_10 allows 1 speaker total.
    const markers = await validateSpeakers(Format.lightning_10, 3)

    expect(markers).toHaveLength(1)
    expect(markers[0].level).toBe('warning')
    expect(markers[0].message).toMatch(/1 speaker at submission/)
  })

  it('still errors when the list is empty', async () => {
    const markers = await validateSpeakers(Format.lightning_10, 0)

    expect(markers.some((m) => m.level === 'error')).toBe(true)
  })

  it('is silent at or under the limit', async () => {
    // workshop_240 allows 4 speakers total.
    expect(await validateSpeakers(Format.workshop_240, 4)).toHaveLength(0)
  })
})
