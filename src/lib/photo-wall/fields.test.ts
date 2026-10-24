/**
 * @vitest-environment node
 *
 * The field checks on a Submit's multipart body (Photo Wall spec §6.2 step
 * 1, §6.4), on a real `FormData`, as the route will hand it over.
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_CAPTION_POINTS,
  MAX_NAME_POINTS,
  checkWallFields,
  isUploadId,
} from './fields'
import { normalizeWallText } from './wall-text'

const UPLOAD_ID = '9b2b6f1e-7f3a-4c2d-8e1f-0a1b2c3d4e5f'
const photo = () =>
  new Blob([Uint8Array.of(0xff, 0xd8, 0xff)], {
    type: 'image/jpeg',
  })

/** A well-formed submit body, with `overrides` replacing or (null) removing fields. */
function body(overrides: Record<string, string | Blob | null> = {}) {
  const form = new FormData()
  const fields: Record<string, string | Blob> = {
    uploadId: UPLOAD_ID,
    caption: 'Hello from Bergen',
    name: 'Kari',
    cropX: '0.5',
    cropY: '0.25',
    marketingConsent: 'true',
    photo: photo(),
  }
  for (const [key, value] of Object.entries({ ...fields, ...overrides })) {
    if (value !== null) form.append(key, value)
  }
  return form
}

describe('checkWallFields', () => {
  it('reads every field of a well-formed body', () => {
    const result = checkWallFields(body())
    expect(result).toMatchObject({
      ok: true,
      fields: {
        uploadId: UPLOAD_ID,
        caption: 'Hello from Bergen',
        name: 'Kari',
        crop: { x: 0.5, y: 0.25 },
        marketingConsent: true,
      },
    })
    if (result.ok) expect(result.fields.photo).toBeInstanceOf(Blob)
  })

  it('leaves an absent or blank caption and name as null', () => {
    expect(checkWallFields(body({ caption: null, name: null }))).toMatchObject({
      ok: true,
      fields: { caption: null, name: null },
    })
    expect(
      checkWallFields(body({ caption: '  \n\t ', name: '' })),
    ).toMatchObject({ ok: true, fields: { caption: null, name: null } })
  })

  it('normalises caption and name: NFC, no control characters, one space per run, trimmed', () => {
    const result = checkWallFields(
      body({
        // Decomposed e + combining acute, a zero-width NUL, a newline run.
        caption: ' Cafe\u0301 \u0000time\r\n\n  on\tthe   wall ',
        name: 'A\u0007.\u00a0B',
      }),
    )
    expect(result).toMatchObject({
      ok: true,
      fields: { caption: 'Café time on the wall', name: 'A. B' },
    })
  })

  it('stores a name with nothing visible as absent, and an invisible-padded one without the padding', () => {
    expect(
      checkWallFields(
        body({ name: '\u3164\u200b\u2800', caption: '\u061c\u202e' }),
      ),
    ).toMatchObject({ ok: true, fields: { name: null, caption: null } })
    expect(
      checkWallFields(body({ name: '\u200bKari\u{e0041}' })),
    ).toMatchObject({ ok: true, fields: { name: 'Kari' } })
  })

  it('counts the limits in code points, not UTF-16 units', () => {
    const emoji80 = '😀'.repeat(MAX_CAPTION_POINTS) // 160 UTF-16 units
    expect(checkWallFields(body({ caption: emoji80 }))).toMatchObject({
      ok: true,
      fields: { caption: emoji80 },
    })
    expect(checkWallFields(body({ caption: `${emoji80}!` }))).toEqual({
      ok: false,
      field: 'caption',
    })
    expect(
      checkWallFields(body({ name: 'n'.repeat(MAX_NAME_POINTS) })),
    ).toMatchObject({ ok: true })
    expect(
      checkWallFields(body({ name: 'n'.repeat(MAX_NAME_POINTS + 1) })),
    ).toEqual({ ok: false, field: 'name' })
    expect(MAX_CAPTION_POINTS).toBe(80)
    expect(MAX_NAME_POINTS).toBe(40)
  })

  it('measures the limit after normalisation, so padding does not count', () => {
    const padded = `  ${'x'.repeat(MAX_CAPTION_POINTS)}  \n`
    expect(checkWallFields(body({ caption: padded }))).toMatchObject({
      ok: true,
    })
  })

  it('refuses a caption or name sent as a file part', () => {
    expect(checkWallFields(body({ caption: photo() }))).toEqual({
      ok: false,
      field: 'caption',
    })
    expect(checkWallFields(body({ name: photo() }))).toEqual({
      ok: false,
      field: 'name',
    })
  })

  it('parses the crop as finite decimals in [0, 1], inclusive', () => {
    for (const [x, y] of [
      ['0', '1'],
      ['1.0', '0.0'],
      ['.5', '0.999'],
    ]) {
      expect(checkWallFields(body({ cropX: x, cropY: y }))).toMatchObject({
        ok: true,
        fields: { crop: { x: Number(x), y: Number(y) } },
      })
    }
  })

  it('refuses a crop outside [0, 1], not a decimal, or missing', () => {
    for (const bad of [
      '1.01',
      '-0.1',
      '-0',
      '1e-1',
      ' 0.5',
      '0.5 ',
      '0,5',
      'NaN',
      'Infinity',
      '0x1',
      '',
      null,
    ]) {
      expect(checkWallFields(body({ cropX: bad }))).toEqual({
        ok: false,
        field: 'crop',
      })
      expect(checkWallFields(body({ cropY: bad }))).toEqual({
        ok: false,
        field: 'crop',
      })
    }
  })

  it('takes marketing consent only as exactly "true" or "false"', () => {
    expect(checkWallFields(body({ marketingConsent: 'false' }))).toMatchObject({
      ok: true,
      fields: { marketingConsent: false },
    })
    for (const bad of [
      'True',
      'TRUE',
      ' true',
      'on',
      '1',
      '0',
      'yes',
      '',
      null,
    ]) {
      expect(checkWallFields(body({ marketingConsent: bad }))).toEqual({
        ok: false,
        field: 'marketingConsent',
      })
    }
  })

  it('requires exactly one photo part, and a file at that', () => {
    expect(checkWallFields(body({ photo: null }))).toEqual({
      ok: false,
      field: 'photo',
    })
    expect(checkWallFields(body({ photo: 'not a file' }))).toEqual({
      ok: false,
      field: 'photo',
    })
    const two = body()
    two.append('photo', photo())
    expect(checkWallFields(two)).toEqual({ ok: false, field: 'photo' })
  })

  it('requires a lower-case UUID v4 uploadId (§6.2 step 1)', () => {
    for (const bad of [
      null,
      '',
      'wallPost-abc',
      UPLOAD_ID.toUpperCase(),
      // Version nibble 1, not 4.
      '9b2b6f1e-7f3a-1c2d-8e1f-0a1b2c3d4e5f',
      // Variant nibble c, not 8–b.
      '9b2b6f1e-7f3a-4c2d-ce1f-0a1b2c3d4e5f',
      `${UPLOAD_ID} `,
      `${UPLOAD_ID}0`,
    ]) {
      expect(checkWallFields(body({ uploadId: bad }))).toEqual({
        ok: false,
        field: 'uploadId',
      })
    }
    expect(isUploadId(UPLOAD_ID)).toBe(true)
    expect(isUploadId(crypto.randomUUID())).toBe(true)
  })

  it('names the uploadId first when several fields are wrong: the route refuses before any read', () => {
    expect(
      checkWallFields(body({ uploadId: 'x', photo: null, cropX: 'z' })),
    ).toEqual({ ok: false, field: 'uploadId' })
  })
})

describe('normalizeWallText', () => {
  it('removes control characters, DEL and C1 included; tab and newline become a space instead', () => {
    expect(normalizeWallText('a\u007fb\u0085c\u009fd')).toBe('abcd')
    expect(normalizeWallText('a\u0000b\u001bc')).toBe('abc')
    expect(normalizeWallText('a\tb\nc\r\nd\u000be')).toBe('a b c d e')
  })

  it('drops a control inside a run of spaces and leaves one space', () => {
    expect(normalizeWallText('a \u0001 b')).toBe('a b')
  })

  it('folds the whitespace controls (tab, newline, VT, FF, CR) into a space instead of dropping them', () => {
    expect(normalizeWallText('a\nb')).toBe('a b')
    expect(normalizeWallText('a\tb')).toBe('a b')
    expect(normalizeWallText('a\u000bb\u000cc\rd')).toBe('a b c d')
  })

  it('removes bidi formatting characters: overrides, embeddings, isolates and marks', () => {
    expect(normalizeWallText('\u202eabc')).toBe('abc')
    expect(normalizeWallText('a\u202a\u202b\u202c\u202dz')).toBe('az')
    expect(normalizeWallText('a\u2066\u2067\u2068\u2069z')).toBe('az')
    expect(normalizeWallText('a\u200e\u200fz')).toBe('az')
  })

  it('keeps the zero-width joiner, so an emoji family stays one and counts its code points', () => {
    const family = '👨\u200d👩\u200d👧' // 5 code points: 3 emoji, 2 ZWJ
    expect(normalizeWallText(family)).toBe(family)
    expect([...family]).toHaveLength(5)
    const sixteen = family.repeat(16) // 80 code points
    expect(checkWallFields(body({ caption: sixteen }))).toMatchObject({
      ok: true,
      fields: { caption: sixteen },
    })
    expect(checkWallFields(body({ caption: `${sixteen}!` }))).toEqual({
      ok: false,
      field: 'caption',
    })
  })

  it('keeps letters of every script and emoji', () => {
    expect(normalizeWallText('Ærlig talt, Ås 😀 日本語')).toBe(
      'Ærlig talt, Ås 😀 日本語',
    )
  })
})
