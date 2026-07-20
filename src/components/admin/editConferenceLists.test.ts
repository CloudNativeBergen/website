import { describe, it, expect } from 'vitest'
import {
  buildStringListPayload,
  buildObjectListPayload,
  validateStringList,
  validateObjectList,
  moveRow,
  type ListRow,
} from './editConferenceLists'

const metricCols = [
  { name: 'label', label: 'Label', required: true },
  { name: 'value', label: 'Value', required: true },
]
const benefitCols = [
  { name: 'title', label: 'Title', required: true },
  { name: 'description', label: 'Description', required: true },
  { name: 'icon', label: 'Icon' },
]

describe('buildStringListPayload', () => {
  it('trims and drops blank rows, keeping order', () => {
    expect(buildStringListPayload(['  a ', '', '  ', 'b'])).toEqual(['a', 'b'])
  })

  it('yields an empty array for an all-blank list', () => {
    expect(buildStringListPayload(['', '   '])).toEqual([])
  })
})

describe('buildObjectListPayload', () => {
  it('drops fully-empty rows and trims cells', () => {
    const rows: ListRow[] = [
      { label: ' Talks ', value: '30', _key: 'k1' },
      { label: '', value: '', _key: 'tmp-9' },
    ]
    expect(buildObjectListPayload(metricCols, rows)).toEqual([
      { label: 'Talks', value: '30', _key: 'k1' },
    ])
  })

  it('preserves a real _key but strips a temp one', () => {
    const rows: ListRow[] = [
      { label: 'A', value: '1', _key: 'real-1' },
      { label: 'B', value: '2', _key: 'tmp-3' },
    ]
    const out = buildObjectListPayload(metricCols, rows)
    expect(out[0]._key).toBe('real-1')
    expect(out[1]).not.toHaveProperty('_key')
  })

  it('omits an empty optional column (icon) but keeps required empties', () => {
    const rows: ListRow[] = [
      { title: 'T', description: 'D', icon: '', _key: 'tmp-1' },
    ]
    const out = buildObjectListPayload(benefitCols, rows)
    expect(out[0]).not.toHaveProperty('icon')
    expect(out[0]).toMatchObject({ title: 'T', description: 'D' })
  })
})

describe('validateStringList', () => {
  it('flags an invalid URL row by index', () => {
    const errs = validateStringList({ name: 'socialLinks', itemType: 'url' }, [
      'https://ok.example',
      'nope',
    ])
    expect(errs['socialLinks.1']).toMatch(/valid URL/)
    expect(errs['socialLinks.0']).toBeUndefined()
  })

  it('flags a scheme-carrying hostname row', () => {
    const errs = validateStringList({ name: 'domains', itemType: 'hostname' }, [
      'https://example.com',
    ])
    expect(errs['domains.0']).toMatch(/bare hostname/)
  })

  it('flags duplicates (hostname is normalized case-insensitively)', () => {
    const errs = validateStringList({ name: 'domains', itemType: 'hostname' }, [
      'example.com',
      'EXAMPLE.com',
    ])
    expect(errs['domains.1']).toBe('Duplicate entry')
  })

  it('requires a non-empty list when allowEmptyList is false', () => {
    const errs = validateStringList(
      {
        name: 'domains',
        itemType: 'hostname',
        allowEmptyList: false,
        itemLabel: 'domain',
      },
      ['', '  '],
    )
    expect(errs.domains).toMatch(/At least one domain/)
  })

  it('accepts a valid list with no errors', () => {
    expect(
      validateStringList({ name: 'domains', itemType: 'hostname' }, [
        'example.com',
        'localhost:3000',
        '*.example.com',
      ]),
    ).toEqual({})
  })
})

describe('validateObjectList', () => {
  it('requires each required column on a non-empty row', () => {
    const errs = validateObjectList(
      { name: 'vanityMetrics', columns: metricCols },
      [{ label: 'Attendees', value: '', _key: 'k' }],
    )
    expect(errs['vanityMetrics.0.value']).toMatch(/required/)
  })

  it('ignores a fully-empty row', () => {
    expect(
      validateObjectList({ name: 'vanityMetrics', columns: metricCols }, [
        { label: '', value: '', _key: 'k' },
      ]),
    ).toEqual({})
  })
})

describe('moveRow', () => {
  it('swaps two positions immutably', () => {
    const src = ['a', 'b', 'c']
    expect(moveRow(src, 0, 2)).toEqual(['c', 'b', 'a'])
    expect(src).toEqual(['a', 'b', 'c'])
  })

  it('is a no-op when out of bounds', () => {
    const src = ['a', 'b']
    expect(moveRow(src, 0, -1)).toBe(src)
    expect(moveRow(src, 1, 2)).toBe(src)
  })
})
