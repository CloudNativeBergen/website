import { describe, expect, it } from 'vitest'
import { PLATFORM_CONSTRAINTS } from '@/lib/social/provider/constraints'
import type { SocialPostAttachment } from '@/lib/social/types'
import {
  editorValueFrom,
  toUpdateInput,
  validateEditorValue,
  type VariantEditorValue,
} from './variant-editor-model'

const image: SocialPostAttachment = {
  _key: 'att-1',
  assetId: 'image-0123456789abcdef0123456789abcdef01234567-2000x1000-jpg',
  width: 2000,
  height: 1000,
  hotspot: null,
  crop: null,
  alt: 'Keynote crowd',
}

const base: VariantEditorValue = {
  body: 'Tickets are live',
  link: '',
  attachments: [],
  timing: { mode: 'default' },
}

describe('editorValueFrom', () => {
  it('shows a custom time in the conference wall clock', () => {
    const value = editorValueFrom({
      variant: {
        _id: 'v',
        _rev: 'r',
        postId: 'p',
        conferenceId: 'c',
        orgId: null,
        platform: 'bluesky',
        body: 'x',
        status: 'draft',
        scheduledAt: '2026-10-05T12:00:00.000Z',
        usesCustomTime: true,
        claimedAt: null,
        link: null,
        attachments: [],
        publishResult: null,
        attempts: [],
        attemptCount: 0,
      },
      post: { attachments: [], defaultScheduledAt: null },
    })
    // Oslo is UTC+2 on 5 October.
    expect(value.timing).toEqual({
      mode: 'custom',
      localInput: '2026-10-05T14:00',
    })
  })
})

describe('validateEditorValue', () => {
  it('counts Bluesky graphemes and flags a body over the limit', () => {
    const v = validateEditorValue(
      { ...base, body: '🇳🇴'.repeat(301) },
      PLATFORM_CONSTRAINTS.bluesky,
      [],
    )
    expect(v.length).toBe(301)
    expect(v.byField.body).toEqual([expect.stringMatching(/301.*300/)])
  })

  it('accepts the same body on LinkedIn', () => {
    const v = validateEditorValue(
      { ...base, body: '🇳🇴'.repeat(301) },
      PLATFORM_CONSTRAINTS.linkedin,
      [],
    )
    expect(v.issues).toEqual([])
  })

  it('flags an alt override that blanks the alt text', () => {
    const v = validateEditorValue(
      {
        ...base,
        attachments: [{ source: 'att-1', crop: null, altOverride: ' ' }],
      },
      PLATFORM_CONSTRAINTS.bluesky,
      [image],
    )
    expect(v.byField.media).toEqual([expect.stringMatching(/alt/i)])
  })

  it('flags an attachment the post no longer has', () => {
    const v = validateEditorValue(
      {
        ...base,
        attachments: [{ source: 'gone', crop: null, altOverride: null }],
      },
      PLATFORM_CONSTRAINTS.linkedin,
      [image],
    )
    expect(v.byField.media).toEqual([expect.stringMatching(/no longer/)])
  })

  it('has no platform rules for an adapter-less platform, only the link shape', () => {
    const v = validateEditorValue({ ...base, link: 'ftp://x' }, null, [])
    expect(v.byField.link).toHaveLength(1)
    expect(v.byField.body).toEqual([])
  })
})

describe('toUpdateInput', () => {
  it('converts a custom Oslo time to an instant and blanks an empty link', () => {
    expect(
      toUpdateInput(
        { _id: 'v', _rev: 'r1' },
        {
          ...base,
          timing: { mode: 'custom', localInput: '2026-10-05T14:00' },
        },
      ),
    ).toEqual({
      variantId: 'v',
      rev: 'r1',
      body: 'Tickets are live',
      link: null,
      attachments: [],
      timing: { mode: 'custom', scheduledAt: '2026-10-05T12:00:00.000Z' },
    })
  })

  it('returns null when the custom time is missing', () => {
    expect(
      toUpdateInput(
        { _id: 'v', _rev: 'r1' },
        { ...base, timing: { mode: 'custom', localInput: '' } },
      ),
    ).toBeNull()
  })

  it('an empty custom time is a field issue, not just a null input', () => {
    const v = validateEditorValue(
      { ...base, timing: { mode: 'custom', localInput: '' } },
      null,
      [],
    )
    expect(v.timeError).toMatch(/pick a date/i)
  })
})
