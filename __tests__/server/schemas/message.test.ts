/**
 * Tests for the message router input schemas (src/server/schemas/message.ts) —
 * the first gate a client payload passes, including the body/subject caps.
 */
import { describe, it, expect } from 'vitest'
import {
  SendMessageSchema,
  SetPreferenceSchema,
  GetConversationSchema,
  ListMessagesSchema,
  ListConversationsSchema,
  parseMessageCursor,
} from '@/server/schemas/message'

describe('SendMessageSchema', () => {
  it('accepts a body of 1..5000 chars', () => {
    expect(SendMessageSchema.safeParse({ body: 'x' }).success).toBe(true)
    expect(
      SendMessageSchema.safeParse({ body: 'x'.repeat(5000) }).success,
    ).toBe(true)
  })

  it('rejects an empty body and a body over 5000 chars', () => {
    expect(SendMessageSchema.safeParse({ body: '' }).success).toBe(false)
    expect(
      SendMessageSchema.safeParse({ body: 'x'.repeat(5001) }).success,
    ).toBe(false)
  })

  it('rejects a whitespace-only body after trimming (A6)', () => {
    expect(SendMessageSchema.safeParse({ body: ' ' }).success).toBe(false)
    expect(SendMessageSchema.safeParse({ body: '\n\n' }).success).toBe(false)
    expect(SendMessageSchema.safeParse({ body: '  \t \n ' }).success).toBe(
      false,
    )
  })

  it('trims surrounding whitespace but preserves interior whitespace (A6)', () => {
    const parsed = SendMessageSchema.safeParse({ body: '  a  b  ' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.body).toBe('a  b')
  })

  it('caps the subject at 200 chars', () => {
    expect(
      SendMessageSchema.safeParse({ subject: 'x'.repeat(200), body: 'hi' })
        .success,
    ).toBe(true)
    expect(
      SendMessageSchema.safeParse({ subject: 'x'.repeat(201), body: 'hi' })
        .success,
    ).toBe(false)
  })
})

describe('SetPreferenceSchema', () => {
  it('requires at least one of muted / emailOverride', () => {
    expect(SetPreferenceSchema.safeParse({ conversationId: 'c' }).success).toBe(
      false,
    )
    expect(
      SetPreferenceSchema.safeParse({ conversationId: 'c', muted: true })
        .success,
    ).toBe(true)
  })

  it('constrains emailOverride to the enum', () => {
    expect(
      SetPreferenceSchema.safeParse({
        conversationId: 'c',
        emailOverride: 'on',
      }).success,
    ).toBe(true)
    expect(
      SetPreferenceSchema.safeParse({
        conversationId: 'c',
        emailOverride: 'sometimes',
      }).success,
    ).toBe(false)
  })
})

describe('GetConversationSchema', () => {
  it('requires a non-empty id', () => {
    expect(GetConversationSchema.safeParse({ id: '' }).success).toBe(false)
    expect(GetConversationSchema.safeParse({ id: 'conv-1' }).success).toBe(true)
  })
})

describe('keyset cursor (F3)', () => {
  const iso = '2026-05-01T12:00:00.000Z'
  const compound = `${iso}~message.abc-123`

  it('accepts an omitted cursor (first page)', () => {
    expect(ListMessagesSchema.safeParse({ conversationId: 'c' }).success).toBe(
      true,
    )
    expect(ListConversationsSchema.safeParse({}).success).toBe(true)
  })

  it('accepts a plain ISO datetime cursor (legacy inflight clients)', () => {
    expect(
      ListMessagesSchema.safeParse({ conversationId: 'c', cursor: iso })
        .success,
    ).toBe(true)
    expect(ListConversationsSchema.safeParse({ cursor: iso }).success).toBe(
      true,
    )
  })

  it('accepts a compound `<iso>~<_id>` cursor', () => {
    expect(
      ListMessagesSchema.safeParse({ conversationId: 'c', cursor: compound })
        .success,
    ).toBe(true)
    expect(
      ListConversationsSchema.safeParse({ cursor: compound }).success,
    ).toBe(true)
  })

  it('rejects garbage: non-datetime, empty id half, or over-long', () => {
    expect(ListConversationsSchema.safeParse({ cursor: 'nope' }).success).toBe(
      false,
    )
    // A compound cursor whose datetime half is invalid.
    expect(
      ListConversationsSchema.safeParse({ cursor: `not-a-date~id` }).success,
    ).toBe(false)
    // A trailing `~` with an empty id half.
    expect(
      ListConversationsSchema.safeParse({ cursor: `${iso}~` }).success,
    ).toBe(false)
    // Over the length cap.
    expect(
      ListConversationsSchema.safeParse({ cursor: `${iso}~${'x'.repeat(300)}` })
        .success,
    ).toBe(false)
  })

  it('parseMessageCursor splits both forms', () => {
    expect(parseMessageCursor(undefined)).toEqual({})
    expect(parseMessageCursor(iso)).toEqual({ before: iso })
    expect(parseMessageCursor(compound)).toEqual({
      before: iso,
      beforeId: 'message.abc-123',
    })
  })
})
