import { describe, expect, it } from 'vitest'
import { commentOf } from './comment'

describe('commentOf', () => {
  it('gives the colour and comment of a response that has both', () => {
    expect(commentOf({ colour: 'red', comment: 'Too fast' })).toEqual({
      colour: 'red',
      comment: 'Too fast',
    })
  })

  it.each([
    ['no comment', { colour: 'green' }],
    ['a blank comment', { colour: 'green', comment: '  \n ' }],
    ['a comment that is not text', { colour: 'green', comment: 42 }],
    ['an unknown colour', { colour: 'blue', comment: 'Hi' }],
    ['no colour', { comment: 'Hi' }],
  ])('has no comment for %s', (_, row) => {
    expect(commentOf(row)).toBeNull()
  })
})
