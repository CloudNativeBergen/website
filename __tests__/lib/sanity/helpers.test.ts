import {
  generateKey,
  ensureArrayKeys,
  createReference,
  createReferenceWithKey,
} from '@/lib/sanity/helpers'

describe('generateKey', () => {
  it('should generate a unique key with default prefix', () => {
    const key1 = generateKey()
    const key2 = generateKey()

    expect(key1).toMatch(/^item-/)
    expect(key2).toMatch(/^item-/)
    expect(key1).not.toBe(key2)
  })

  it('should generate a unique key with custom prefix', () => {
    const key1 = generateKey('section')
    const key2 = generateKey('section')

    expect(key1).toMatch(/^section-/)
    expect(key2).toMatch(/^section-/)
    expect(key1).not.toBe(key2)
  })

  it('should generate unique keys on rapid successive calls', () => {
    const keys = Array.from({ length: 100 }, () => generateKey())
    const uniqueKeys = new Set(keys)

    expect(uniqueKeys.size).toBe(keys.length)
  })
})

describe('ensureArrayKeys', () => {
  it('should add _key to objects without one', () => {
    const input = [{ name: 'Item 1' }, { name: 'Item 2' }]
    const result = ensureArrayKeys(input)

    expect(result[0]).toHaveProperty('_key')
    expect(result[1]).toHaveProperty('_key')
    expect(result[0]._key).toMatch(/^item-/)
    expect(result[1]._key).toMatch(/^item-/)
    expect(result[0]._key).not.toBe(result[1]._key)
  })

  it('should preserve existing _key values', () => {
    const input = [{ name: 'Item 1', _key: 'existing-key' }, { name: 'Item 2' }]
    const result = ensureArrayKeys(input)

    expect(result[0]._key).toBe('existing-key')
    expect(result[1]._key).toMatch(/^item-/)
  })

  it('should use custom prefix', () => {
    const input = [{ name: 'Section 1' }]
    const result = ensureArrayKeys(input, 'section')

    expect(result[0]._key).toMatch(/^section-/)
  })
})

describe('createReference', () => {
  it('should create a reference object', () => {
    const ref = createReference('doc-id-123')

    expect(ref).toEqual({
      _type: 'reference',
      _ref: 'doc-id-123',
    })
  })
})

describe('createReferenceWithKey', () => {
  it('should create a reference with _key', () => {
    const ref = createReferenceWithKey('doc-id-123')

    expect(ref._type).toBe('reference')
    expect(ref._ref).toBe('doc-id-123')
    expect(ref._key).toMatch(/^ref-/)
  })

  it('should use custom prefix for _key', () => {
    const ref = createReferenceWithKey('doc-id-123', 'speaker')

    expect(ref._type).toBe('reference')
    expect(ref._ref).toBe('doc-id-123')
    expect(ref._key).toMatch(/^speaker-/)
  })

  it('should generate unique keys for different references', () => {
    const ref1 = createReferenceWithKey('doc-1')
    const ref2 = createReferenceWithKey('doc-2')

    expect(ref1._key).not.toBe(ref2._key)
  })
})
