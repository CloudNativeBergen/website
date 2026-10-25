/**
 * The Judgement record (Content judgement spec §7.1) never holds the judged
 * text or photo, only a hash, and never blocks deleting its content. A new
 * field here is a privacy decision (it lands on /privacy and in
 * PRIVACY_OPERATIONS.md), so the field list is pinned.
 */
import { describe, expect, it } from 'vitest'
import contentJudgement from '../../sanity/schemaTypes/contentJudgement'
import organization from '../../sanity/schemaTypes/organization'

type Field = {
  name: string
  type: string
  weak?: boolean
  fields?: Field[]
  of?: Field[]
}
const fields = contentJudgement.fields as unknown as Field[]
const field = (name: string) => fields.find((f) => f.name === name)!

/** Every field name at any depth. */
function allNames(list: Field[]): string[] {
  return list.flatMap((f) => [
    f.name,
    ...allNames(f.fields ?? []),
    ...allNames(f.of ?? []),
  ])
}

describe('contentJudgement holds no judged content', () => {
  it('has exactly the spec fields', () => {
    expect(fields.map((f) => f.name)).toEqual([
      'conference',
      'surface',
      'content',
      'parts',
      'model',
      'questionSet',
      'contentHash',
      'inputTokens',
      'judgedAt',
    ])
  })

  it('holds only scores inside its parts, at any depth', () => {
    // Every nested field, pinned: a new one (a `note`, an `excerpt`) is a
    // privacy decision and must come with the /privacy copy.
    expect(allNames(field('parts').of!)).toEqual([
      'judgementPart',
      'part',
      'answers',
      'judgementAnswer',
      'question',
      'probability',
      'choice',
      'probabilities',
      'choiceProbability',
      'choice',
      'probability',
      'confidence',
    ])
  })

  it('is read-only in the Studio: only the server writes Judgements', () => {
    expect((contentJudgement as { readOnly?: unknown }).readOnly).toBe(true)
  })

  it('references its content weakly', () => {
    expect(field('content').type).toBe('reference')
    expect(field('content').weak).toBe(true)
  })
})

describe('organization.contentJudgement', () => {
  const setting = (organization.fields as unknown as Field[]).find(
    (f) => f.name === 'contentJudgement',
  )!
  it('is read-only in the Studio, so every change records who made it', () => {
    expect((setting as Field & { readOnly?: unknown }).readOnly).toBe(true)
  })

  it('records who changed it with a weak reference', () => {
    const changedBy = setting.fields!.find((f) => f.name === 'changedBy')!
    expect(changedBy.weak).toBe(true)
    expect(setting.fields!.map((f) => f.name)).toEqual([
      'enabled',
      'enforceFeedbackComments',
      'enforceWallPosts',
      'changedAt',
      'changedBy',
    ])
  })
})
