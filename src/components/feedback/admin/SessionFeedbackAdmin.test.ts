import { describe, expect, it } from 'vitest'
import { removeQuestion } from './FeedbackCommentItem'

describe('removeQuestion (speaker feedback spec §10.3)', () => {
  it('names the count', () => {
    expect(removeQuestion(1)).toBe('Remove 1 response?')
    expect(removeQuestion(38)).toBe('Remove 38 responses?')
  })
})
